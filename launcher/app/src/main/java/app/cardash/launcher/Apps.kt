package app.cardash.launcher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.text.Collator
import java.util.Locale
import java.util.concurrent.Executors

class AppEntry(val component: ComponentName, val label: String) {
    val key: String = component.flattenToString()
    val pkg: String get() = component.packageName
}

/** Danh sách ứng dụng đã cài và bộ nạp icon bo góc đồng đều. */
class AppRepo(private val ctx: Context) {
    private val pm = ctx.packageManager
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val cache = LruCache<String, Bitmap>(300)
    private val iconPx = (ctx.resources.displayMetrics.density * 96).toInt().coerceIn(96, 256)

    var all: List<AppEntry> = emptyList()
        private set

    fun byKey(key: String): AppEntry? = all.firstOrNull { it.key == key }

    /** Đọc danh sách app ở luồng nền rồi gọi [done] trên luồng chính. */
    fun reload(done: () -> Unit) {
        worker.execute {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val collator = Collator.getInstance(Locale("vi", "VN"))
            val list = try {
                pm.queryIntentActivities(intent, 0)
                    .filter { it.activityInfo.packageName != ctx.packageName }
                    .map {
                        AppEntry(
                            ComponentName(it.activityInfo.packageName, it.activityInfo.name),
                            it.loadLabel(pm).toString().trim()
                        )
                    }
                    .sortedWith { a, b -> collator.compare(a.label, b.label) }
            } catch (e: Exception) {
                emptyList()
            }
            main.post {
                all = list
                done()
            }
        }
    }

    fun forget(pkg: String) {
        cache.snapshot().keys.filter { it.startsWith("$pkg/") }.forEach { cache.remove(it) }
    }

    /** Gắn icon của app vào [view]; nạp ở luồng nền nếu chưa có trong bộ nhớ đệm. */
    fun bind(view: ImageView, entry: AppEntry) {
        view.tag = entry.key
        val hit = cache.get(entry.key)
        if (hit != null) {
            view.setImageBitmap(hit)
            return
        }
        view.setImageDrawable(null)
        worker.execute {
            val bmp = try {
                shape(pm.getActivityIcon(entry.component))
            } catch (e: Exception) {
                try {
                    shape(pm.defaultActivityIcon)
                } catch (e2: Exception) {
                    null
                }
            } ?: return@execute
            cache.put(entry.key, bmp)
            main.post { if (view.tag == entry.key) view.setImageBitmap(bmp) }
        }
    }

    /** Vẽ icon vào khung vuông bo góc để mọi app trông cùng một kiểu. */
    private fun shape(d: Drawable): Bitmap {
        val s = iconPx
        val raw = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(raw)
        if (Build.VERSION.SDK_INT >= 26 && d is AdaptiveIconDrawable) {
            // Hai lớp của icon thích ứng rộng 108dp, phần nhìn thấy là 72dp ở giữa.
            val ext = s / 4
            d.background?.let { it.setBounds(-ext, -ext, s + ext, s + ext); it.draw(c) }
            d.foreground?.let { it.setBounds(-ext, -ext, s + ext, s + ext); it.draw(c) }
        } else {
            c.drawColor(0xFFF1F3F6.toInt())
            val inset = (s * 0.11f).toInt()
            d.setBounds(inset, inset, s - inset, s - inset)
            d.draw(c)
        }
        val out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = BitmapShader(raw, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val r = s * 0.225f
        Canvas(out).drawRoundRect(RectF(0f, 0f, s.toFloat(), s.toFloat()), r, r, paint)
        raw.recycle()
        return out
    }
}
