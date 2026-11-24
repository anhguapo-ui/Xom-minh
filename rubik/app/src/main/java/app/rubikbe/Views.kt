package app.rubikbe

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Bảng màu dùng trong app. Mã: 0 trắng, 1 vàng, 2 đỏ, 3 cam, 4 xanh dương, 5 xanh lá. */
object Palette {
    val rgb = intArrayOf(
        0xFFF7F7F7.toInt(), 0xFFFFD60A.toInt(), 0xFFE63946.toInt(),
        0xFFFF8A00.toInt(), 0xFF1E6BFF.toInt(), 0xFF19B35A.toInt()
    )
    val names = arrayOf("Trắng", "Vàng", "Đỏ", "Cam", "Xanh dương", "Xanh lá")
    const val EMPTY = 0xFFC9D1DE.toInt()

    /** Ô giữa mặc định khi cầm VÀNG ở trên, XANH LÁ ở trước: U R F D L B. */
    val defaultCenters = intArrayOf(1, 3, 5, 0, 2, 4)

    fun color(id: Int): Int = if (id in 0..5) rgb[id] else EMPTY

    fun solved(): IntArray = IntArray(54) { defaultCenters[it / 9] }

    /** Chữ tối trên màu sáng, chữ trắng trên màu đậm. */
    fun ink(id: Int): Int = if (id == 0 || id == 1 || id == 3 || id < 0) 0xFF2B2D42.toInt() else Color.WHITE
}

/** Hình trải phẳng 6 mặt để bé chạm tô màu. */
class NetView(ctx: Context) : View(ctx) {
    var colors: IntArray = IntArray(54) { -1 }
        set(value) {
            field = value
            invalidate()
        }
    var highlight = -1
        set(value) {
            field = value
            invalidate()
        }
    var showLabels = true
    var onCell: ((Int) -> Unit)? = null

    private val place = arrayOf(
        intArrayOf(1, 0), intArrayOf(2, 1), intArrayOf(1, 1), intArrayOf(1, 2), intArrayOf(0, 1), intArrayOf(3, 1)
    )
    private val labels = arrayOf("TRÊN", "PHẢI", "TRƯỚC", "DƯỚI", "TRÁI", "SAU")
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val rect = RectF()
    private var cell = 0f
    private var gap = 0f
    private var ox = 0f
    private var oy = 0f
    private var lastPainted = -1

    private fun layout() {
        cell = min(width / 12.9f, height / 9.6f)
        gap = cell * 0.3f
        val totalW = 12 * cell + 3 * gap
        val totalH = 9 * cell + 2 * gap
        ox = (width - totalW) / 2f
        oy = (height - totalH) / 2f
    }

    private fun cellRect(index: Int, out: RectF) {
        val face = index / 9
        val r = (index % 9) / 3
        val c = index % 3
        val fx = ox + place[face][0] * (3 * cell + gap)
        val fy = oy + place[face][1] * (3 * cell + gap)
        val inset = cell * 0.06f
        out.set(fx + c * cell + inset, fy + r * cell + inset, fx + (c + 1) * cell - inset, fy + (r + 1) * cell - inset)
    }

    override fun onDraw(canvas: Canvas) {
        layout()
        val radius = cell * 0.2f
        for (i in 0 until 54) {
            cellRect(i, rect)
            paint.color = Palette.color(colors[i])
            canvas.drawRoundRect(rect, radius, radius, paint)
            stroke.color = 0x33000000
            stroke.strokeWidth = cell * 0.04f
            canvas.drawRoundRect(rect, radius, radius, stroke)
            if (i % 9 == 4 && showLabels) {
                text.color = Palette.ink(colors[i])
                text.textSize = cell * 0.2f
                canvas.drawText(labels[i / 9], rect.centerX(), rect.centerY() + text.textSize * 0.35f, text)
            }
        }
        if (highlight >= 0) {
            val fx = ox + place[highlight][0] * (3 * cell + gap)
            val fy = oy + place[highlight][1] * (3 * cell + gap)
            stroke.color = CubeView.ACCENT
            stroke.strokeWidth = cell * 0.14f
            rect.set(fx - gap * 0.3f, fy - gap * 0.3f, fx + 3 * cell + gap * 0.3f, fy + 3 * cell + gap * 0.3f)
            canvas.drawRoundRect(rect, radius * 1.5f, radius * 1.5f, stroke)
        }
    }

    private fun hit(x: Float, y: Float): Int {
        for (i in 0 until 54) {
            cellRect(i, rect)
            if (rect.contains(x, y)) return i
        }
        return -1
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val listener = onCell ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                    lastPainted = -1
                    parent?.requestDisallowInterceptTouchEvent(true)
                }
                val i = hit(event.x, event.y)
                if (i >= 0 && i != lastPainted) {
                    lastPainted = i
                    listener(i)
                    invalidate()
                }
            }
        }
        return true
    }
}

/** Khung giữ đúng tỉ lệ khung hình camera bên trong vùng được cấp. */
class AspectFrame(ctx: Context) : FrameLayout(ctx) {
    var aspect = 0.75f
        set(value) {
            field = value
            requestLayout()
        }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        var w = MeasureSpec.getSize(widthMeasureSpec)
        var h = MeasureSpec.getSize(heightMeasureSpec)
        if (w > 0 && h > 0) {
            if (w.toFloat() / h > aspect) w = (h * aspect).toInt() else h = (w / aspect).toInt()
        }
        super.onMeasure(
            MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
        )
    }
}

/** Lưới 3×3 vẽ chồng lên hình camera, kèm chấm màu máy đang thấy ở mỗi ô. */
class GridOverlay(ctx: Context) : View(ctx) {
    var live: IntArray? = null
        set(value) {
            field = value
            invalidate()
        }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
    }
    private val shade = Paint().apply { color = 0x66000000 }
    private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
    }

    override fun onDraw(canvas: Canvas) {
        val side = Scanner.GRID * min(width, height)
        val x0 = (width - side) / 2f
        val y0 = (height - side) / 2f
        val cell = side / 3f
        // Làm tối phần ngoài lưới để bé biết đặt khối vào đâu.
        canvas.drawRect(0f, 0f, width.toFloat(), y0, shade)
        canvas.drawRect(0f, y0 + side, width.toFloat(), height.toFloat(), shade)
        canvas.drawRect(0f, y0, x0, y0 + side, shade)
        canvas.drawRect(x0 + side, y0, width.toFloat(), y0 + side, shade)
        line.strokeWidth = cell * 0.04f
        for (i in 0..3) {
            canvas.drawLine(x0 + i * cell, y0, x0 + i * cell, y0 + side, line)
            canvas.drawLine(x0, y0 + i * cell, x0 + side, y0 + i * cell, line)
        }
        val colors = live ?: return
        ring.strokeWidth = cell * 0.04f
        for (i in 0 until 9) {
            val cx = x0 + (i % 3 + 0.5f) * cell
            val cy = y0 + (i / 3 + 0.5f) * cell
            dot.color = Palette.color(ColorMath.guess(colors[i]))
            canvas.drawCircle(cx, cy, cell * 0.13f, dot)
            canvas.drawCircle(cx, cy, cell * 0.13f, ring)
        }
    }
}

/** Pháo hoa giấy khi bé giải xong. */
class ConfettiView(ctx: Context) : View(ctx) {
    private class Bit(var x: Float, var y: Float, val vx: Float, var vy: Float, var rot: Float, val vr: Float, val color: Int, val size: Float)

    private val bits = ArrayList<Bit>()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var started = 0L
    var onDone: (() -> Unit)? = null

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        if (bits.isNotEmpty() || w == 0) return
        val rnd = java.util.Random()
        val unit = min(w, h) / 40f
        for (i in 0 until 140) {
            bits.add(
                Bit(
                    rnd.nextFloat() * w, -rnd.nextFloat() * h * 0.6f,
                    (rnd.nextFloat() - 0.5f) * unit * 0.4f, unit * (0.25f + rnd.nextFloat() * 0.35f),
                    rnd.nextFloat() * 360f, (rnd.nextFloat() - 0.5f) * 14f,
                    Palette.rgb[rnd.nextInt(6)].let { if (it == Palette.rgb[0]) CubeView.ACCENT else it },
                    unit * (0.6f + rnd.nextFloat() * 0.6f)
                )
            )
        }
        started = System.currentTimeMillis()
    }

    override fun onDraw(canvas: Canvas) {
        val elapsed = System.currentTimeMillis() - started
        for (b in bits) {
            b.x += b.vx + sin(b.rot / 30f) * 1.2f
            b.y += b.vy
            b.vy *= 1.004f
            b.rot += b.vr
            paint.color = b.color
            canvas.save()
            canvas.translate(b.x, b.y)
            canvas.rotate(b.rot)
            canvas.drawRect(-b.size / 2, -b.size / 4 * (1 + cos(b.rot / 20f)), b.size / 2, b.size / 4, paint)
            canvas.restore()
        }
        if (elapsed < 4500) postInvalidateOnAnimation() else onDone?.invoke()
    }
}
