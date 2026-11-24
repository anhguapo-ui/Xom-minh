package app.rubikbe

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.CornerPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Khối Rubik 3D vẽ bằng Canvas: kéo để xoay góc nhìn, có hoạt hình xoay từng mặt
 * và mũi tên chỉ bước xoay sắp làm.
 */
class CubeView(ctx: Context) : View(ctx) {
    /** Màu 54 ô (mã màu trong [Palette]); -1 là ô chưa tô. */
    var colors: IntArray = Palette.solved()
        set(value) {
            field = value
            invalidate()
        }

    var yaw = -35f
    var pitch = 28f

    var autoSpin = false
        set(value) {
            field = value
            invalidate()
        }

    /** Bước xoay sắp làm: vẽ mũi tên lên mặt đó và xoay góc nhìn để thấy mặt đó. */
    var pendingMove = -1
        set(value) {
            field = value
            if (value >= 0) ensureVisible(value / 3)
            invalidate()
        }

    private var animMove = -1
    private var animT = 0f
    private var mover: ValueAnimator? = null
    private var viewer: ValueAnimator? = null

    val busy: Boolean get() = mover != null

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rounded = Paint(Paint.ANTI_ALIAS_FLAG)
    private val arrow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val head = Paint(Paint.ANTI_ALIAS_FLAG)
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val path = Path()

    // Thông số chiếu, tính lại mỗi lần vẽ.
    private var cx = 0f
    private var cy = 0f
    private var scale = 1f
    private var cyaw = 1f
    private var syaw = 0f
    private var cpit = 1f
    private var spit = 0f
    private val tmp = FloatArray(3)
    private val pts = FloatArray(8)

    private class Cubie(val x: Int, val y: Int, val z: Int, val moving: Boolean, val depth: Float)

    /** Hoạt hình bước xoay [m]; khi xong thì cập nhật màu rồi gọi [done]. */
    fun animateMove(m: Int, duration: Long = 520, done: () -> Unit) {
        halt()
        animMove = m
        animT = 0f
        val a = ValueAnimator.ofFloat(0f, 1f)
        a.duration = if (m % 3 == 1) duration * 3 / 2 else duration
        a.interpolator = AccelerateDecelerateInterpolator()
        a.addUpdateListener {
            animT = it.animatedValue as Float
            invalidate()
        }
        a.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                colors = Geometry.apply(colors, m)
                animMove = -1
                mover = null
                invalidate()
                done()
            }
        })
        mover = a
        a.start()
    }

    /** Dừng ngay hoạt hình đang chạy mà không gọi lại hàm kết thúc. */
    fun halt() {
        mover?.let {
            it.removeAllListeners()
            it.cancel()
        }
        mover = null
        animMove = -1
    }

    fun resetView() {
        animateView(-35f, 28f)
    }

    private fun ensureVisible(face: Int) {
        if (faceFacing(face, yaw, pitch) > 0.25f) return
        when (face) {
            Faces.L -> animateView(35f, 28f)
            Faces.D -> animateView(-35f, -28f)
            Faces.B -> animateView(-145f, 28f)
            else -> animateView(-35f, 28f)
        }
    }

    private fun animateView(toYaw: Float, toPitch: Float) {
        viewer?.cancel()
        val fromYaw = yaw
        val fromPitch = pitch
        var delta = (toYaw - fromYaw) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        val a = ValueAnimator.ofFloat(0f, 1f)
        a.duration = 450
        a.interpolator = AccelerateDecelerateInterpolator()
        a.addUpdateListener {
            val t = it.animatedValue as Float
            yaw = fromYaw + delta * t
            pitch = fromPitch + (toPitch - fromPitch) * t
            invalidate()
        }
        viewer = a
        a.start()
    }

    /** Mức mặt [face] quay về phía người xem (âm là bị che). */
    private fun faceFacing(face: Int, yawDeg: Float, pitchDeg: Float): Float {
        val n = Geometry.axis[face]
        val yr = Math.toRadians(yawDeg.toDouble())
        val pr = Math.toRadians(pitchDeg.toDouble())
        val z1 = -n[0] * sin(yr) + n[2] * cos(yr)
        return (n[1] * sin(pr) + z1 * cos(pr)).toFloat()
    }

    // ----- Phép biến đổi -----

    private fun rotateAnim(v: FloatArray, k: Int, angle: Float) {
        if (k < 0 || angle == 0f) return
        val c = cos(angle)
        val s = sin(angle)
        val x = v[0]
        val y = v[1]
        val z = v[2]
        when (k) {
            0 -> { v[1] = y * c - z * s; v[2] = y * s + z * c }
            1 -> { v[0] = x * c + z * s; v[2] = -x * s + z * c }
            else -> { v[0] = x * c - y * s; v[1] = x * s + y * c }
        }
    }

    private fun toView(v: FloatArray) {
        val x1 = v[0] * cyaw + v[2] * syaw
        val z1 = -v[0] * syaw + v[2] * cyaw
        val y2 = v[1] * cpit - z1 * spit
        val z2 = v[1] * spit + z1 * cpit
        v[0] = x1
        v[1] = y2
        v[2] = z2
    }

    /** Chiếu điểm 3D (đã ở hệ người xem) ra màn hình, ghi vào out[o], out[o+1]. */
    private fun project(v: FloatArray, out: FloatArray, o: Int) {
        val k = 9f / (9f - v[2])
        out[o] = cx + v[0] * scale * k
        out[o + 1] = cy - v[1] * scale * k
    }

    override fun onDraw(canvas: Canvas) {
        if (autoSpin && mover == null) {
            yaw += 0.35f
            postInvalidateOnAnimation()
        }
        cx = width / 2f
        cy = height / 2f
        scale = min(width, height) / 5.6f
        val yr = Math.toRadians(yaw.toDouble())
        val pr = Math.toRadians(pitch.toDouble())
        cyaw = cos(yr).toFloat()
        syaw = sin(yr).toFloat()
        cpit = cos(pr).toFloat()
        spit = sin(pr).toFloat()
        rounded.pathEffect = CornerPathEffect(scale * 0.09f)

        var ak = -1
        var asg = 0
        var angle = 0f
        if (animMove >= 0) {
            val f = animMove / 3
            ak = Geometry.axisIndex(f)
            asg = Geometry.axis[f][ak]
            val turns = when (animMove % 3) {
                0 -> 1
                1 -> 2
                else -> -1
            }
            angle = (-PI / 2 * asg * turns * animT).toFloat()
        }

        val cubies = ArrayList<Cubie>(26)
        for (x in -1..1) for (y in -1..1) for (z in -1..1) {
            if (x == 0 && y == 0 && z == 0) continue
            val coord = when (ak) {
                0 -> x
                1 -> y
                else -> z
            }
            val moving = ak >= 0 && coord * asg == 1
            tmp[0] = x.toFloat(); tmp[1] = y.toFloat(); tmp[2] = z.toFloat()
            if (moving) rotateAnim(tmp, ak, angle)
            toView(tmp)
            cubies.add(Cubie(x, y, z, moving, tmp[2]))
        }
        cubies.sortBy { it.depth }
        for (c in cubies) drawCubie(canvas, c, if (c.moving) ak else -1, angle)
        if (pendingMove >= 0 && animMove < 0) drawArrow(canvas, pendingMove)
    }

    private fun drawCubie(canvas: Canvas, c: Cubie, ak: Int, angle: Float) {
        val p = intArrayOf(c.x, c.y, c.z)
        val h = 0.47f
        for (face in 0 until 6) {
            val n = Geometry.axis[face]
            // Hướng mặt sau khi xoay, để bỏ mặt quay lưng.
            tmp[0] = n[0].toFloat(); tmp[1] = n[1].toFloat(); tmp[2] = n[2].toFloat()
            rotateAnim(tmp, ak, angle)
            toView(tmp)
            val facing = tmp[2]
            if (facing <= 0.02f) continue
            val k = Geometry.axisIndex(face)
            val t1 = (k + 1) % 3
            val t2 = (k + 2) % 3
            quad(p, n, k, t1, t2, h, h, ak, angle)
            fill.color = 0xFF16171D.toInt()
            canvas.drawPath(path, fill)
            // Ô dán màu chỉ có ở mặt ngoài của khối.
            if (p[k] == n[k]) {
                val idx = Geometry.index(p, n)
                if (idx >= 0) {
                    quad(p, n, k, t1, t2, h + 0.002f, 0.39f, ak, angle)
                    rounded.color = shade(Palette.color(colors[idx]), 0.72f + 0.28f * facing)
                    canvas.drawPath(path, rounded)
                }
            }
        }
    }

    /** Dựng hình vuông trên mặt [n] của khối con tại [p], nửa cạnh [half]. */
    private fun quad(
        p: IntArray, n: IntArray, k: Int, t1: Int, t2: Int, offset: Float, half: Float, ak: Int, angle: Float
    ) {
        for (i in 0 until 4) {
            tmp[0] = p[0].toFloat(); tmp[1] = p[1].toFloat(); tmp[2] = p[2].toFloat()
            tmp[k] += n[k] * offset
            tmp[t1] += SIGN1[i] * half
            tmp[t2] += SIGN2[i] * half
            rotateAnim(tmp, ak, angle)
            toView(tmp)
            project(tmp, pts, i * 2)
        }
        path.rewind()
        path.moveTo(pts[0], pts[1])
        path.lineTo(pts[2], pts[3])
        path.lineTo(pts[4], pts[5])
        path.lineTo(pts[6], pts[7])
        path.close()
    }

    private fun drawArrow(canvas: Canvas, m: Int) {
        val face = m / 3
        if (faceFacing(face, yaw, pitch) < 0.12f) return
        val k = Geometry.axisIndex(face)
        val s = Geometry.axis[face][k]
        // Hai trục trên mặt sao cho t1 × t2 hướng ra ngoài mặt: góc tăng = ngược chiều kim đồng hồ.
        val t1 = if (s > 0) (k + 1) % 3 else (k + 2) % 3
        val t2 = if (s > 0) (k + 2) % 3 else (k + 1) % 3
        val power = m % 3
        val sweep = when (power) {
            0 -> -110.0
            1 -> -220.0
            else -> 110.0
        }
        val start = 140.0
        val steps = 24
        val screen = FloatArray((steps + 1) * 2)
        for (i in 0..steps) {
            val phi = Math.toRadians(start + sweep * i / steps)
            tmp[0] = 0f; tmp[1] = 0f; tmp[2] = 0f
            tmp[k] = s * 1.56f
            tmp[t1] += (0.95 * cos(phi)).toFloat()
            tmp[t2] += (0.95 * sin(phi)).toFloat()
            toView(tmp)
            project(tmp, screen, i * 2)
        }
        path.rewind()
        path.moveTo(screen[0], screen[1])
        for (i in 1..steps) path.lineTo(screen[i * 2], screen[i * 2 + 1])
        arrow.color = 0xCC1B1D2A.toInt()
        arrow.strokeWidth = scale * 0.24f
        canvas.drawPath(path, arrow)
        arrow.color = ACCENT
        arrow.strokeWidth = scale * 0.14f
        canvas.drawPath(path, arrow)

        // Đầu mũi tên theo hướng đoạn cuối.
        val ex = screen[steps * 2]
        val ey = screen[steps * 2 + 1]
        val px = screen[(steps - 2) * 2]
        val py = screen[(steps - 2) * 2 + 1]
        val dir = atan2(ey - py, ex - px)
        val size = scale * 0.42f
        path.rewind()
        path.moveTo(ex + cos(dir) * size * 0.6f, ey + sin(dir) * size * 0.6f)
        path.lineTo(ex + cos(dir + 2.4f) * size * 0.55f, ey + sin(dir + 2.4f) * size * 0.55f)
        path.lineTo(ex + cos(dir - 2.4f) * size * 0.55f, ey + sin(dir - 2.4f) * size * 0.55f)
        path.close()
        head.color = 0xCC1B1D2A.toInt()
        head.style = Paint.Style.STROKE
        head.strokeWidth = scale * 0.1f
        head.strokeJoin = Paint.Join.ROUND
        canvas.drawPath(path, head)
        head.style = Paint.Style.FILL
        head.color = ACCENT
        canvas.drawPath(path, head)

        if (power == 1) {
            val mx = screen[steps]
            val my = screen[steps + 1]
            label.textSize = scale * 0.5f
            label.color = Color.WHITE
            label.setShadowLayer(scale * 0.08f, 0f, 0f, 0xFF1B1D2A.toInt())
            canvas.drawText("×2", mx, my + label.textSize * 0.35f, label)
        }
    }

    private fun shade(color: Int, f: Float): Int {
        val r = (Color.red(color) * f).toInt().coerceIn(0, 255)
        val g = (Color.green(color) * f).toInt().coerceIn(0, 255)
        val b = (Color.blue(color) * f).toInt().coerceIn(0, 255)
        return Color.rgb(r, g, b)
    }

    private var lastX = 0f
    private var lastY = 0f
    private var dragged = 0f

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
                dragged = 0f
                viewer?.cancel()
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX
                val dy = event.y - lastY
                dragged += abs(dx) + abs(dy)
                val k = 220f / min(width, height).coerceAtLeast(1)
                yaw += dx * k
                pitch = (pitch + dy * k).coerceIn(-85f, 85f)
                lastX = event.x
                lastY = event.y
                invalidate()
            }
        }
        return true
    }

    companion object {
        const val ACCENT = 0xFFFF3D8B.toInt()
        private val SIGN1 = floatArrayOf(1f, 1f, -1f, -1f)
        private val SIGN2 = floatArrayOf(1f, -1f, -1f, 1f)
    }
}
