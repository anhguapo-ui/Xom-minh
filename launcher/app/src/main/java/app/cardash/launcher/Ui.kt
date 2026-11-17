package app.cardash.launcher

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.TextView

object Ui {
    const val TEXT = 0xFFFFFFFF.toInt()
    const val TEXT_DIM = 0xB3FFFFFF.toInt()
    const val CARD = 0x24FFFFFF
    const val DOCK = 0x59000000
    val ACCENTS = intArrayOf(
        0xFF4DA3FF.toInt(), 0xFF2DD4BF.toInt(), 0xFF4ADE80.toInt(),
        0xFFFB923C.toInt(), 0xFFF87171.toInt(), 0xFFA78BFA.toInt()
    )
    val ACCENT_NAMES = arrayOf("Xanh dương", "Xanh ngọc", "Xanh lá", "Cam", "Đỏ", "Tím")

    /** Màu nhấn đang dùng; MainActivity đặt lại theo lựa chọn đã lưu. */
    var accent = ACCENTS[0]

    /** Các bộ màu nền; đổi trong phần Cài đặt. */
    val WALLPAPERS = arrayOf(
        intArrayOf(0xFF0B1226.toInt(), 0xFF1D3461.toInt(), 0xFF3A2466.toInt()),
        intArrayOf(0xFF08141A.toInt(), 0xFF0F4C5C.toInt(), 0xFF1B6B4A.toInt()),
        intArrayOf(0xFF1A0B14.toInt(), 0xFF6B1E3F.toInt(), 0xFFB5532A.toInt()),
        intArrayOf(0xFF050505.toInt(), 0xFF141414.toInt(), 0xFF262626.toInt())
    )

    fun wallpaper(index: Int): Drawable {
        val colors = WALLPAPERS[((index % WALLPAPERS.size) + WALLPAPERS.size) % WALLPAPERS.size]
        return GradientDrawable(GradientDrawable.Orientation.TL_BR, colors)
    }

    fun rounded(color: Int, radius: Float): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
    }

    /** Thẻ tối bóng: chuyển sắc nhẹ từ trên xuống, viền sáng mảnh. */
    fun glass(radius: Float, strokePx: Int): GradientDrawable = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(0xEB2C323E.toInt(), 0xEB14171D.toInt())
    ).apply {
        cornerRadius = radius
        setStroke(strokePx, 0x24FFFFFF)
    }

    /** Cắt nội dung của view theo góc bo. */
    fun clipRound(view: View, radius: Float) {
        view.clipToOutline = true
        view.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(v: View, outline: Outline) {
                outline.setRoundRect(0, 0, v.width, v.height, radius)
            }
        }
    }

    /** Nền bo góc có hiệu ứng gợn khi chạm. */
    fun pressable(color: Int, radius: Float): Drawable = RippleDrawable(
        ColorStateList.valueOf(0x40FFFFFF),
        rounded(color, radius),
        rounded(0xFFFFFFFF.toInt(), radius)
    )

    fun text(
        ctx: Context,
        sizeSp: Float,
        color: Int = TEXT,
        bold: Boolean = false,
        lines: Int = 1,
        center: Boolean = false
    ): TextView = TextView(ctx).apply {
        textSize = sizeSp
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        maxLines = lines
        ellipsize = TextUtils.TruncateAt.END
        if (center) gravity = Gravity.CENTER
        includeFontPadding = false
    }
}

/** Biểu tượng nét đơn giản tự vẽ, không dùng tệp ảnh. */
class Glyph(private val kind: Int, color: Int = Ui.TEXT) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val s = minOf(b.width(), b.height()).toFloat()
        if (s <= 0f) return
        canvas.save()
        canvas.translate(b.left + (b.width() - s) / 2f, b.top + (b.height() - s) / 2f)
        stroke.strokeWidth = s * 0.09f
        when (kind) {
            PLAY -> canvas.drawPath(triangle(s, 0.32f, 0.78f), fill)
            PAUSE -> {
                canvas.drawRoundRect(RectF(s * .27f, s * .22f, s * .43f, s * .78f), s * .04f, s * .04f, fill)
                canvas.drawRoundRect(RectF(s * .57f, s * .22f, s * .73f, s * .78f), s * .04f, s * .04f, fill)
            }
            NEXT -> {
                canvas.drawPath(triangle(s, 0.20f, 0.52f), fill)
                canvas.drawPath(triangle(s, 0.50f, 0.82f), fill)
            }
            PREV -> {
                canvas.scale(-1f, 1f, s / 2f, s / 2f)
                canvas.drawPath(triangle(s, 0.20f, 0.52f), fill)
                canvas.drawPath(triangle(s, 0.50f, 0.82f), fill)
            }
            GRID -> for (r in 0..2) for (c in 0..2) {
                val x = s * (0.24f + 0.26f * c)
                val y = s * (0.24f + 0.26f * r)
                canvas.drawRoundRect(
                    RectF(x - s * .09f, y - s * .09f, x + s * .09f, y + s * .09f),
                    s * .035f, s * .035f, fill
                )
            }
            DASH -> {
                val r = s * .06f
                canvas.drawRoundRect(RectF(s * .16f, s * .2f, s * .50f, s * .8f), r, r, fill)
                canvas.drawRoundRect(RectF(s * .56f, s * .2f, s * .84f, s * .47f), r, r, fill)
                canvas.drawRoundRect(RectF(s * .56f, s * .53f, s * .84f, s * .8f), r, r, fill)
            }
            PLUS -> {
                canvas.drawLine(s * .5f, s * .28f, s * .5f, s * .72f, stroke)
                canvas.drawLine(s * .28f, s * .5f, s * .72f, s * .5f, stroke)
            }
            GEAR -> {
                canvas.drawCircle(s / 2f, s / 2f, s * .2f, stroke)
                for (i in 0 until 8) {
                    canvas.save()
                    canvas.rotate(45f * i, s / 2f, s / 2f)
                    canvas.drawLine(s / 2f, s * .16f, s / 2f, s * .22f, stroke)
                    canvas.restore()
                }
            }
            MINUS -> canvas.drawLine(s * .28f, s * .5f, s * .72f, s * .5f, stroke)
            TARGET -> {
                canvas.drawCircle(s / 2f, s / 2f, s * .24f, stroke)
                canvas.drawCircle(s / 2f, s / 2f, s * .08f, fill)
                canvas.drawLine(s * .5f, s * .12f, s * .5f, s * .22f, stroke)
                canvas.drawLine(s * .5f, s * .78f, s * .5f, s * .88f, stroke)
                canvas.drawLine(s * .12f, s * .5f, s * .22f, s * .5f, stroke)
                canvas.drawLine(s * .78f, s * .5f, s * .88f, s * .5f, stroke)
            }
            SEARCH -> {
                canvas.drawCircle(s * .44f, s * .44f, s * .2f, stroke)
                canvas.drawLine(s * .6f, s * .6f, s * .78f, s * .78f, stroke)
            }
            SUN -> {
                canvas.drawCircle(s / 2f, s / 2f, s * .2f, fill)
                stroke.strokeWidth = s * .07f
                for (i in 0 until 8) {
                    canvas.save()
                    canvas.rotate(45f * i, s / 2f, s / 2f)
                    canvas.drawLine(s / 2f, s * .12f, s / 2f, s * .2f, stroke)
                    canvas.restore()
                }
            }
            CLOUD -> cloud(canvas, s, 0f)
            RAIN -> {
                cloud(canvas, s, -s * .1f)
                stroke.strokeWidth = s * .06f
                for (i in 0..2) {
                    val x = s * (0.36f + 0.16f * i)
                    canvas.drawLine(x, s * .72f, x - s * .05f, s * .86f, stroke)
                }
            }
            NOTE -> {
                canvas.drawOval(RectF(s * .24f, s * .60f, s * .44f, s * .76f), fill)
                canvas.drawOval(RectF(s * .56f, s * .52f, s * .76f, s * .68f), fill)
                stroke.strokeWidth = s * .06f
                canvas.drawLine(s * .41f, s * .68f, s * .41f, s * .28f, stroke)
                canvas.drawLine(s * .73f, s * .60f, s * .73f, s * .22f, stroke)
                canvas.drawLine(s * .41f, s * .28f, s * .73f, s * .22f, stroke)
            }
        }
        canvas.restore()
    }

    private fun cloud(canvas: Canvas, s: Float, dy: Float) {
        canvas.drawCircle(s * .36f, s * .56f + dy, s * .15f, fill)
        canvas.drawCircle(s * .52f, s * .44f + dy, s * .2f, fill)
        canvas.drawCircle(s * .68f, s * .56f + dy, s * .14f, fill)
        canvas.drawRoundRect(
            RectF(s * .24f, s * .52f + dy, s * .8f, s * .7f + dy), s * .09f, s * .09f, fill
        )
    }

    private fun triangle(s: Float, left: Float, right: Float) = Path().apply {
        moveTo(s * left, s * .24f)
        lineTo(s * right, s * .5f)
        lineTo(s * left, s * .76f)
        close()
    }

    override fun setAlpha(alpha: Int) {
        fill.alpha = alpha
        stroke.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        fill.colorFilter = colorFilter
        stroke.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    companion object {
        const val PLAY = 0
        const val PAUSE = 1
        const val NEXT = 2
        const val PREV = 3
        const val GRID = 4
        const val DASH = 5
        const val PLUS = 6
        const val GEAR = 7
        const val NOTE = 8
        const val MINUS = 9
        const val TARGET = 10
        const val SEARCH = 11
        const val SUN = 12
        const val CLOUD = 13
        const val RAIN = 14
    }
}
