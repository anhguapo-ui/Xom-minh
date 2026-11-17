package app.cardash.launcher

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.LruCache
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.LinearInterpolator
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/**
 * Bản đồ nền tối vẽ từ ô ảnh OpenStreetMap, có mũi tên vị trí hiện tại.
 * Khi đang bám theo xe, bản đồ trượt mượt và (tuỳ chọn) xoay theo hướng chạy.
 * Kéo để xem chỗ khác, chạm để gọi [onTap]. Ô ảnh được lưu đệm trên máy.
 */
class MapView(ctx: Context) : View(ctx) {
    var onTap: (() -> Unit)? = null
    var onFollowChanged: ((Boolean) -> Unit)? = null
    var accent = Ui.accent
    var headingUp = true
        set(value) {
            field = value
            invalidate()
        }

    var following = true
        private set
    private var zoom = 16
    private var centerLat = 21.0285 // Hà Nội, dùng khi chưa có GPS
    private var centerLon = 105.8542

    // Vị trí đang vẽ (đã nội suy cho mượt) và hai đầu của đoạn nội suy.
    private var shownLat = Double.NaN
    private var shownLon = Double.NaN
    private var shownBearing = 0f
    private var hasHeading = false
    private var fromLat = 0.0
    private var fromLon = 0.0
    private var fromBearing = 0f
    private var toLat = 0.0
    private var toLon = 0.0
    private var toBearing = 0f

    private val glide = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 950
        interpolator = LinearInterpolator()
        addUpdateListener { step(it.animatedFraction) }
    }

    /** Phóng to ô ảnh trên màn mật độ cao để chữ trên bản đồ không quá nhỏ. */
    private val scale = (resources.displayMetrics.density * 1.25f).coerceAtLeast(1f)
    private val tileSize = 256f * scale
    private val memory = LruCache<String, Bitmap>(96)
    private val pending = HashSet<String>()
    private val failedAt = HashMap<String, Long>()
    private val pool = Executors.newFixedThreadPool(3)
    private val tileDir = File(ctx.cacheDir, "tiles")
    private val rect = RectF()
    private val decode = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 }

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
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        color = 0xFFFFFFFF.toInt()
    }
    private val arrow = Path()

    /** [bearing] là hướng xe tính bằng độ, null nếu chưa biết. */
    fun setLocation(lat: Double, lon: Double, bearing: Float?) {
        if (bearing != null) hasHeading = true
        val jump = shownLat.isNaN() || abs(lat - shownLat) > 0.005 || abs(lon - shownLon) > 0.005
        if (jump) {
            glide.cancel()
            shownLat = lat
            shownLon = lon
            if (bearing != null) shownBearing = bearing
            if (following) {
                centerLat = lat
                centerLon = lon
            }
            invalidate()
            return
        }
        glide.cancel()
        fromLat = shownLat
        fromLon = shownLon
        fromBearing = shownBearing
        toLat = lat
        toLon = lon
        toBearing = bearing ?: shownBearing
        glide.start()
    }

    private fun step(f: Float) {
        shownLat = fromLat + (toLat - fromLat) * f
        shownLon = fromLon + (toLon - fromLon) * f
        // Xoay theo cung ngắn nhất (ví dụ 350° sang 10° là +20°, không phải -340°).
        val turn = ((toBearing - fromBearing + 540f) % 360f) - 180f
        shownBearing = fromBearing + turn * f
        if (following) {
            centerLat = shownLat
            centerLon = shownLon
        }
        invalidate()
    }

    fun zoomBy(delta: Int) {
        zoom = (zoom + delta).coerceIn(3, 19)
        invalidate()
    }

    fun recenter() {
        if (!shownLat.isNaN()) {
            centerLat = shownLat
            centerLon = shownLon
        }
        setFollowing(true)
        invalidate()
    }

    private fun setFollowing(value: Boolean) {
        if (following == value) return
        following = value
        onFollowChanged?.invoke(value)
    }

    override fun onDetachedFromWindow() {
        glide.cancel()
        super.onDetachedFromWindow()
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
        val rotating = following && headingUp && hasHeading
        // Khi xoay theo hướng xe, đặt xe thấp hơn tâm để thấy nhiều đường phía trước.
        val ax = width / 2f
        val ay = if (rotating) height * 0.62f else height / 2f
        val left = xOf(centerLon) - ax
        val top = yOf(centerLat) - ay

        canvas.save()
        if (rotating) canvas.rotate(-shownBearing, ax, ay)

        // Vùng cần phủ ô ảnh: khi xoay phải phủ cả hình tròn bao quanh khung nhìn.
        val reach = if (rotating) hypot(maxOf(ax, width - ax), maxOf(ay, height - ay)) else 0f
        val minX = if (rotating) ax - reach else 0f
        val maxX = if (rotating) ax + reach else width.toFloat()
        val minY = if (rotating) ay - reach else 0f
        val maxY = if (rotating) ay + reach else height.toFloat()
        val n = 1 shl zoom
        val x0 = floor((left + minX) / tileSize).toInt()
        val x1 = floor((left + maxX) / tileSize).toInt()
        val y0 = floor((top + minY) / tileSize).toInt()
        val y1 = floor((top + maxY) / tileSize).toInt()
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
                // Chờm 1px để không lộ khe giữa các ô khi xoay.
                rect.set(l, t, l + tileSize + 1f, t + tileSize + 1f)
                canvas.drawBitmap(bmp, null, rect, tilePaint)
            }
        }

        if (!shownLat.isNaN()) {
            val px = (xOf(shownLon) - left).toFloat()
            val py = (yOf(shownLat) - top).toFloat()
            val r = resources.displayMetrics.density * 10f
            fill.color = (accent and 0x00FFFFFF) or 0x40000000
            canvas.drawCircle(px, py, r * 2.6f, fill)
            fill.color = accent
            if (hasHeading) {
                // Mũi tên chỉ hướng xe; trong hệ bản đồ, 0° là hướng Bắc (lên trên).
                canvas.translate(px, py)
                canvas.rotate(shownBearing)
                arrow.rewind()
                arrow.moveTo(0f, -r * 1.6f)
                arrow.lineTo(r * 1.15f, r * 1.25f)
                arrow.lineTo(0f, r * 0.6f)
                arrow.lineTo(-r * 1.15f, r * 1.25f)
                arrow.close()
                outline.strokeWidth = r * 0.3f
                canvas.drawPath(arrow, fill)
                canvas.drawPath(arrow, outline)
            } else {
                fill.color = 0xFFFFFFFF.toInt()
                canvas.drawCircle(px, py, r * 1.25f, fill)
                fill.color = accent
                canvas.drawCircle(px, py, r, fill)
            }
        }
        canvas.restore()
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
            BitmapFactory.decodeFile(file.path, decode)?.let { return it }
            file.delete()
        }
        val conn = URL("https://tile.openstreetmap.org/$key.png").openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.setRequestProperty("User-Agent", "CarDash/1.0 (personal car launcher)")
        try {
            if (conn.responseCode != 200) return null
            val bytes = conn.inputStream.use { it.readBytes() }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode) ?: return null
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
                if (!dragging && hypot(event.x - downX, event.y - downY) > slop) {
                    dragging = true
                    // Kéo tay thì thôi bám xe; bản đồ trở về hướng Bắc ở trên.
                    setFollowing(false)
                }
                if (dragging) {
                    val size = worldSize()
                    val wx = xOf(centerLon) - (event.x - lastX)
                    val wy = (yOf(centerLat) - (event.y - lastY)).coerceIn(0.0, size)
                    centerLon = ((wx / size * 360.0 - 180.0) + 540.0) % 360.0 - 180.0
                    centerLat = Math.toDegrees(atan(sinh(PI * (1.0 - 2.0 * wy / size))))
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
