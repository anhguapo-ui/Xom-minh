package app.cardash.launcher

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.RectF
import android.util.LruCache
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/**
 * Bản đồ nền tối vẽ từ ô ảnh OpenStreetMap, có chấm vị trí hiện tại.
 * Kéo để xem chỗ khác, chạm để gọi [onTap]. Ô ảnh được lưu đệm trên máy.
 */
class MapView(ctx: Context) : View(ctx) {
    var onTap: (() -> Unit)? = null
    var onFollowChanged: ((Boolean) -> Unit)? = null
    var accent = Ui.accent

    var following = true
        private set
    private var zoom = 16
    private var centerLat = 21.0285 // Hà Nội, dùng khi chưa có GPS
    private var centerLon = 105.8542
    private var fixLat = Double.NaN
    private var fixLon = Double.NaN

    /** Phóng to ô ảnh trên màn mật độ cao để chữ trên bản đồ không quá nhỏ. */
    private val scale = (resources.displayMetrics.density * 1.25f).coerceAtLeast(1f)
    private val tileSize = 256f * scale
    private val memory = LruCache<String, Bitmap>(72)
    private val pending = HashSet<String>()
    private val failedAt = HashMap<String, Long>()
    private val pool = Executors.newFixedThreadPool(3)
    private val tileDir = File(ctx.cacheDir, "tiles")
    private val rect = RectF()

    private val tilePaint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        // Đảo sáng tối nhưng giữ tông màu, rồi ngả xanh đậm cho hợp nền xe.
        colorFilter = ColorMatrixColorFilter(
            ColorMatrix(
                floatArrayOf(
                    0.574f, -1.430f, -0.144f, 0f, 255f + 14f,
                    -0.426f, -0.430f, -0.144f, 0f, 255f + 24f,
                    -0.426f, -1.430f, 0.856f, 0f, 255f + 44f,
                    0f, 0f, 0f, 1f, 0f
                )
            )
        )
    }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)

    fun setLocation(lat: Double, lon: Double) {
        fixLat = lat
        fixLon = lon
        if (following) {
            centerLat = lat
            centerLon = lon
        }
        invalidate()
    }

    fun zoomBy(delta: Int) {
        zoom = (zoom + delta).coerceIn(3, 19)
        invalidate()
    }

    fun recenter() {
        if (!fixLat.isNaN()) {
            centerLat = fixLat
            centerLon = fixLon
        }
        setFollowing(true)
        invalidate()
    }

    private fun setFollowing(value: Boolean) {
        if (following == value) return
        following = value
        onFollowChanged?.invoke(value)
    }

    // Toạ độ điểm ảnh trên bản đồ thế giới ở mức zoom hiện tại (đã nhân scale).
    private fun worldSize() = (1 shl zoom) * tileSize.toDouble()
    private fun xOf(lon: Double) = (lon + 180.0) / 360.0 * worldSize()
    private fun yOf(lat: Double): Double {
        val r = Math.toRadians(lat.coerceIn(-85.0, 85.0))
        return (1.0 - ln(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * worldSize()
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(0xFF10202F.toInt())
        val left = xOf(centerLon) - width / 2.0
        val top = yOf(centerLat) - height / 2.0
        val n = 1 shl zoom
        val x0 = floor(left / tileSize).toInt()
        val x1 = floor((left + width) / tileSize).toInt()
        val y0 = floor(top / tileSize).toInt()
        val y1 = floor((top + height) / tileSize).toInt()
        for (ty in y0..y1) {
            if (ty < 0 || ty >= n) continue
            for (tx in x0..x1) {
                val wx = ((tx % n) + n) % n
                val key = "$zoom/$wx/$ty"
                val bmp = memory.get(key)
                if (bmp == null) {
                    request(key)
                    continue
                }
                val l = (tx * tileSize - left).toFloat()
                val t = (ty * tileSize - top).toFloat()
                rect.set(l, t, l + tileSize, t + tileSize)
                canvas.drawBitmap(bmp, null, rect, tilePaint)
            }
        }
        if (!fixLat.isNaN()) {
            val px = (xOf(fixLon) - left).toFloat()
            val py = (yOf(fixLat) - top).toFloat()
            val r = resources.displayMetrics.density * 9f
            dot.color = (accent and 0x00FFFFFF) or 0x40000000
            canvas.drawCircle(px, py, r * 2.4f, dot)
            dot.color = 0xFFFFFFFF.toInt()
            canvas.drawCircle(px, py, r * 1.25f, dot)
            dot.color = accent
            canvas.drawCircle(px, py, r, dot)
        }
    }

    private fun request(key: String) {
        if (key in pending) return
        val failed = failedAt[key]
        if (failed != null && System.currentTimeMillis() - failed < 15_000) return
        pending.add(key)
        pool.execute {
            val bmp = try {
                load(key)
            } catch (e: Exception) {
                null
            }
            post {
                pending.remove(key)
                if (bmp != null) {
                    memory.put(key, bmp)
                    invalidate()
                } else {
                    failedAt[key] = System.currentTimeMillis()
                }
            }
        }
    }

    /** Đọc ô ảnh từ bộ đệm trên máy; chưa có thì tải về rồi lưu lại. */
    private fun load(key: String): Bitmap? {
        val file = File(tileDir, "$key.png")
        if (file.exists()) {
            BitmapFactory.decodeFile(file.path)?.let { return it }
            file.delete()
        }
        val conn = URL("https://tile.openstreetmap.org/$key.png").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("User-Agent", "CarDash/1.0 (personal car launcher)")
        try {
            if (conn.responseCode != 200) return null
            val bytes = conn.inputStream.use { it.readBytes() }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            file.parentFile?.mkdirs()
            file.writeBytes(bytes)
            return bmp
        } finally {
            conn.disconnect()
        }
    }

    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var dragging = false
    private val slop = ViewConfiguration.get(ctx).scaledTouchSlop

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                lastX = event.x
                lastY = event.y
                dragging = false
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                if (!dragging && hypot(event.x - downX, event.y - downY) > slop) dragging = true
                if (dragging) {
                    val size = worldSize()
                    val wx = xOf(centerLon) - (event.x - lastX)
                    val wy = (yOf(centerLat) - (event.y - lastY)).coerceIn(0.0, size)
                    centerLon = ((wx / size * 360.0 - 180.0) + 540.0) % 360.0 - 180.0
                    centerLat = Math.toDegrees(atan(sinh(PI * (1.0 - 2.0 * wy / size))))
                    setFollowing(false)
                    invalidate()
                }
                lastX = event.x
                lastY = event.y
            }
            MotionEvent.ACTION_UP -> if (!dragging) onTap?.invoke()
        }
        return true
    }
}
