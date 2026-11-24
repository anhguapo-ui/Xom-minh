@file:Suppress("DEPRECATION")

package app.rubikbe

import android.app.Activity
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.view.Surface
import android.view.TextureView
import kotlin.math.cbrt
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Camera cho màn quét: hiện hình xem trước và đọc màu trung bình của 9 ô
 * nằm trong lưới giữa khung hình (khoảng 7 lần mỗi giây).
 * Dùng API Camera cũ vì không cần thư viện ngoài và chạy được trên máy đời cũ.
 */
class Scanner(
    private val activity: Activity,
    private val onSample: (IntArray) -> Unit,
    private val onSize: (Int, Int) -> Unit,
    private val onError: (String) -> Unit
) : TextureView.SurfaceTextureListener, Camera.PreviewCallback {
    val view = TextureView(activity)
    private var camera: Camera? = null
    private var w = 0
    private var h = 0
    private var rotation = 0
    private var mirror = false
    private var lastSample = 0L

    init {
        view.surfaceTextureListener = this
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) = open(surface)
    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        close()
        return true
    }

    private fun open(surface: SurfaceTexture) {
        if (camera != null) return
        try {
            val count = Camera.getNumberOfCameras()
            if (count == 0) {
                onError("Máy này không có camera")
                return
            }
            val info = Camera.CameraInfo()
            var id = 0
            for (i in 0 until count) {
                Camera.getCameraInfo(i, info)
                if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) {
                    id = i
                    break
                }
            }
            Camera.getCameraInfo(id, info)
            val cam = Camera.open(id)
            val params = cam.parameters
            // Khung hình vừa phải là đủ để đọc màu, lại nhẹ máy.
            val size = params.supportedPreviewSizes
                .filter { it.width * it.height <= 1280 * 960 }
                .maxByOrNull { it.width * it.height }
                ?: params.supportedPreviewSizes.first()
            params.setPreviewSize(size.width, size.height)
            val modes = params.supportedFocusModes ?: emptyList()
            when {
                Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE in modes ->
                    params.focusMode = Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE
                Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO in modes ->
                    params.focusMode = Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO
            }
            cam.parameters = params
            val degrees = when (activity.windowManager.defaultDisplay.rotation) {
                Surface.ROTATION_90 -> 90
                Surface.ROTATION_180 -> 180
                Surface.ROTATION_270 -> 270
                else -> 0
            }
            mirror = info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT
            rotation = if (mirror) (info.orientation + degrees) % 360 else (info.orientation - degrees + 360) % 360
            cam.setDisplayOrientation(if (mirror) (360 - rotation) % 360 else rotation)
            cam.setPreviewTexture(surface)
            w = size.width
            h = size.height
            cam.setPreviewCallback(this)
            cam.startPreview()
            camera = cam
            if (rotation % 180 == 90) onSize(h, w) else onSize(w, h)
        } catch (e: Exception) {
            close()
            onError("Không mở được camera")
        }
    }

    fun close() {
        camera?.let {
            try {
                it.setPreviewCallback(null)
                it.stopPreview()
                it.release()
            } catch (e: Exception) {
                // Camera đã bị đóng.
            }
        }
        camera = null
    }

    override fun onPreviewFrame(data: ByteArray?, cam: Camera?) {
        if (data == null || w == 0) return
        val now = System.currentTimeMillis()
        if (now - lastSample < 140) return
        lastSample = now
        if (data.size < w * h * 3 / 2) return
        onSample(sample(data))
    }

    /** Đổi toạ độ điểm trên hình đang hiển thị sang toạ độ trong khung hình của camera. */
    private fun toFrame(dx: Float, dy: Float, dw: Int, dh: Int): Pair<Int, Int> {
        val x = if (mirror) dw - 1 - dx else dx
        val (fx, fy) = when (rotation) {
            90 -> dy to (h - 1 - x)
            180 -> (w - 1 - x) to (h - 1 - dy)
            270 -> (w - 1 - dy) to x
            else -> x to dy
        }
        return fx.toInt().coerceIn(0, w - 1) to fy.toInt().coerceIn(0, h - 1)
    }

    private fun sample(data: ByteArray): IntArray {
        val dw = if (rotation % 180 == 90) h else w
        val dh = if (rotation % 180 == 90) w else h
        val side = GRID * min(dw, dh)
        val x0 = (dw - side) / 2f
        val y0 = (dh - side) / 2f
        val cell = side / 3f
        val out = IntArray(9)
        for (i in 0 until 9) {
            val cx = x0 + (i % 3 + 0.5f) * cell
            val cy = y0 + (i / 3 + 0.5f) * cell
            val reach = cell * 0.22f
            var rs = 0f
            var gs = 0f
            var bs = 0f
            var n = 0
            for (a in -3..3) for (b in -3..3) {
                val (fx, fy) = toFrame(cx + a * reach / 3f, cy + b * reach / 3f, dw, dh)
                val y = (data[fy * w + fx].toInt() and 0xFF).toFloat()
                val uv = w * h + (fy shr 1) * w + (fx and 1.inv())
                val v = (data[uv].toInt() and 0xFF) - 128f
                val u = (data[uv + 1].toInt() and 0xFF) - 128f
                rs += (y + 1.402f * v).coerceIn(0f, 255f)
                gs += (y - 0.344f * u - 0.714f * v).coerceIn(0f, 255f)
                bs += (y + 1.772f * u).coerceIn(0f, 255f)
                n++
            }
            out[i] = Color.rgb((rs / n).toInt(), (gs / n).toInt(), (bs / n).toInt())
        }
        return out
    }

    companion object {
        /** Cạnh lưới so với cạnh ngắn của hình. */
        const val GRID = 0.62f
    }
}

/** Nhận diện màu từ ảnh camera. */
object ColorMath {
    /** Màu điển hình của từng loại ô khi chụp bằng camera điện thoại. */
    private val reference = intArrayOf(
        Color.rgb(215, 220, 225), Color.rgb(220, 205, 40), Color.rgb(185, 35, 45),
        Color.rgb(235, 110, 35), Color.rgb(30, 85, 185), Color.rgb(35, 160, 85)
    )

    fun lab(color: Int): FloatArray {
        fun lin(c: Int): Double {
            val v = c / 255.0
            return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        val r = lin(Color.red(color))
        val g = lin(Color.green(color))
        val b = lin(Color.blue(color))
        val x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
        val y = r * 0.2126 + g * 0.7152 + b * 0.0722
        val z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
        fun f(t: Double) = if (t > 0.008856) cbrt(t) else 7.787 * t + 16.0 / 116
        val fx = f(x)
        val fy = f(y)
        val fz = f(z)
        return floatArrayOf((116 * fy - 16).toFloat(), (500 * (fx - fy)).toFloat(), (200 * (fy - fz)).toFloat())
    }

    private fun dist(a: FloatArray, b: FloatArray): Float {
        val d0 = a[0] - b[0]
        val d1 = a[1] - b[1]
        val d2 = a[2] - b[2]
        // Giảm trọng số độ sáng: cùng một màu có thể sáng tối khác nhau theo bóng đổ.
        return sqrt(0.5f * d0 * d0 + d1 * d1 + d2 * d2)
    }

    /** Đoán nhanh một màu (dùng cho chấm màu khi đang quét). */
    fun guess(color: Int): Int {
        val hsv = FloatArray(3)
        Color.colorToHSV(color, hsv)
        val hue = hsv[0]
        val sat = hsv[1]
        val value = hsv[2]
        if (sat < 0.28f && value > 0.35f) return 0
        if (sat < 0.2f) return 0
        return when {
            hue < 14f || hue >= 330f -> 2
            hue < 38f -> 3
            hue < 75f -> 1
            hue < 165f -> 5
            hue < 265f -> 4
            else -> 2
        }
    }

    /**
     * Gán màu cho 54 ô sau khi quét đủ 6 mặt. [samples][k] là 9 màu của mặt [order][k].
     * Lấy ô giữa mỗi mặt làm mẫu, rồi chia các ô còn lại sao cho mỗi màu đúng 9 ô.
     */
    fun classify(samples: Array<IntArray>, order: IntArray): IntArray {
        val labs = Array(54) { FloatArray(3) }
        for (k in 0 until 6) for (i in 0 until 9) labs[order[k] * 9 + i] = lab(samples[k][i])
        val centerLab = Array(6) { labs[it * 9 + 4] }

        // Màu hiển thị cho từng mặt: thử mọi cách ghép 6 ô giữa với 6 màu chuẩn.
        val refLab = Array(6) { lab(reference[it]) }
        val faceColor = IntArray(6)
        var bestCost = Float.MAX_VALUE
        val perm = IntArray(6) { it }
        fun tryPerm(k: Int) {
            if (k == 6) {
                var cost = 0f
                for (f in 0 until 6) cost += dist(centerLab[f], refLab[perm[f]])
                if (cost < bestCost) {
                    bestCost = cost
                    perm.copyInto(faceColor)
                }
                return
            }
            for (i in k until 6) {
                var t = perm[k]; perm[k] = perm[i]; perm[i] = t
                tryPerm(k + 1)
                t = perm[k]; perm[k] = perm[i]; perm[i] = t
            }
        }
        tryPerm(0)

        // Mỗi ô về mặt có ô giữa gần màu nhất, mỗi mặt nhận tối đa 8 ô (cộng ô giữa là 9).
        val pairs = ArrayList<Triple<Int, Int, Float>>()
        for (i in 0 until 54) {
            if (i % 9 == 4) continue
            for (f in 0 until 6) pairs.add(Triple(i, f, dist(labs[i], centerLab[f])))
        }
        pairs.sortBy { it.third }
        val face = IntArray(54) { if (it % 9 == 4) it / 9 else -1 }
        val load = IntArray(6)
        for ((i, f, _) in pairs) {
            if (face[i] >= 0 || load[f] >= 8) continue
            face[i] = f
            load[f]++
        }
        return IntArray(54) { faceColor[face[it]] }
    }
}
