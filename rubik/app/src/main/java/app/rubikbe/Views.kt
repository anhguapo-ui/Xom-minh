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

/**
 * Một mặt 3×3 ô thật to để bé chạm tô màu. Bốn thanh màu quanh lưới cho biết
 * mặt nào nằm phía trên, phải, dưới, trái — để bé tự kiểm tra mình cầm khối đúng chưa.
 */
class FaceGrid(ctx: Context) : View(ctx) {
    var cells: IntArray = IntArray(9) { -1 }
        set(value) {
            field = value
            invalidate()
        }

    /** Màu ô giữa của 4 mặt bên cạnh: trên, phải, dưới, trái. */
    var neighbors: IntArray = IntArray(4) { -1 }
        set(value) {
            field = value
            invalidate()
        }

    /** Ô (0..8) nghi bị tô nhầm, vẽ viền đỏ. */
    var suspects: Set<Int> = emptySet()
        set(value) {
            field = value
            invalidate()
        }
    var onCell: ((Int) -> Unit)? = null

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val rect = RectF()
    private var lastPainted = -1

    private fun geometry(): FloatArray {
        val size = min(width, height).toFloat()
        val bar = size * 0.075f
        val gap = size * 0.03f
        val grid = size - 2 * (bar + gap)
        val ox = (width - size) / 2f + bar + gap
        val oy = (height - size) / 2f + bar + gap
        return floatArrayOf(size, bar, gap, grid, ox, oy)
    }

    override fun onDraw(canvas: Canvas) {
        val g = geometry()
        val size = g[0]
        val bar = g[1]
        val gap = g[2]
        val grid = g[3]
        val ox = g[4]
        val oy = g[5]
        val left = (width - size) / 2f
        val top = (height - size) / 2f
        val r = bar / 2f
        // Thanh màu mặt bên cạnh.
        val sides = arrayOf(
            RectF(ox + grid * 0.15f, top, ox + grid * 0.85f, top + bar),
            RectF(left + size - bar, oy + grid * 0.15f, left + size, oy + grid * 0.85f),
            RectF(ox + grid * 0.15f, top + size - bar, ox + grid * 0.85f, top + size),
            RectF(left, oy + grid * 0.15f, left + bar, oy + grid * 0.85f)
        )
        for (k in 0 until 4) {
            paint.color = Palette.color(neighbors[k])
            canvas.drawRoundRect(sides[k], r, r, paint)
            stroke.color = 0x40000000
            stroke.strokeWidth = bar * 0.1f
            canvas.drawRoundRect(sides[k], r, r, stroke)
        }
        // Nền đen như thân khối thật.
        rect.set(ox - gap * 0.4f, oy - gap * 0.4f, ox + grid + gap * 0.4f, oy + grid + gap * 0.4f)
        paint.color = 0xFF1B1D2A.toInt()
        canvas.drawRoundRect(rect, grid * 0.06f, grid * 0.06f, paint)
        val cell = grid / 3f
        val inset = cell * 0.06f
        val radius = cell * 0.16f
        for (i in 0 until 9) {
            val x = ox + (i % 3) * cell
            val y = oy + (i / 3) * cell
            rect.set(x + inset, y + inset, x + cell - inset, y + cell - inset)
            paint.color = Palette.color(cells[i])
            canvas.drawRoundRect(rect, radius, radius, paint)
            if (cells[i] < 0) {
                paint.color = 0x66FFFFFF
                paint.textAlign = Paint.Align.CENTER
                paint.textSize = cell * 0.45f
                canvas.drawText("?", rect.centerX(), rect.centerY() + paint.textSize * 0.35f, paint)
            }
            if (i == 4) {
                paint.color = 0x55000000
                canvas.drawCircle(rect.centerX(), rect.centerY(), cell * 0.07f, paint)
            }
            if (i in suspects) {
                stroke.color = 0xFFE11D48.toInt()
                stroke.strokeWidth = cell * 0.1f
                canvas.drawRoundRect(rect, radius, radius, stroke)
            }
        }
    }

    private fun hit(x: Float, y: Float): Int {
        val g = geometry()
        val grid = g[3]
        val cx = x - g[4]
        val cy = y - g[5]
        if (cx < 0 || cy < 0 || cx >= grid || cy >= grid) return -1
        return (cy / (grid / 3f)).toInt() * 3 + (cx / (grid / 3f)).toInt()
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
                if (i in 0..8 && i != lastPainted) {
                    lastPainted = i
                    listener(i)
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

/** Lưới 3×3 vẽ chồng lên hình camera, kèm chấm màu máy đang đoán ở mỗi ô. */
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
        val ids = live ?: return
        ring.strokeWidth = cell * 0.04f
        for (i in 0 until 9) {
            val cx = x0 + (i % 3 + 0.5f) * cell
            val cy = y0 + (i / 3 + 0.5f) * cell
            dot.color = Palette.color(ids[i])
            canvas.drawCircle(cx, cy, cell * 0.14f, dot)
            canvas.drawCircle(cx, cy, cell * 0.14f, ring)
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
