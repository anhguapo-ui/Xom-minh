package app.rubikbe

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.Locale
import java.util.Random

class MainActivity : Activity() {
    private enum class Screen { HOME, INPUT, SOLVE }

    private lateinit var root: FrameLayout
    private var screen = Screen.HOME
    private val handler = Handler(Looper.getMainLooper())

    // Khối bé đang nhập (mã màu trong Palette, -1 là chưa tô).
    private val colors = IntArray(54) { -1 }
    private var brush = -2
    private var faceStep = 0
    private var suspects: Set<Int> = emptySet()
    private var inputNote: String? = null
    private val swatches = ArrayList<Pair<Int, TextView>>()
    private var grid: FaceGrid? = null
    private var poseCube: CubeView? = null
    private var stepHint: TextView? = null
    private var noteView: TextView? = null
    private var backBtn: TextView? = null
    private var forwardBtn: TextView? = null

    // Camera (tuỳ chọn, ngay trong màn nhập từng mặt).
    private var cameraOn = false
    private var scanner: Scanner? = null
    private var overlay: GridOverlay? = null
    private var liveIds: IntArray? = null
    private var liveSamples: IntArray? = null
    private val learned = arrayOfNulls<FloatArray>(6)

    // Giải.
    private var startColors = IntArray(54)
    private var fastSteps: List<Step>? = null
    private var learnSteps: List<Step>? = null
    private var solveError: String? = null
    private var solveToken = 0
    private var learnMode = false
    private var stepIndex = 0
    private var autoPlay = false
    private var sampleScramble: String? = null
    private var celebrated = false
    private var lastSpokenIndex = -1

    private var cube: CubeView? = null
    private var tabFast: TextView? = null
    private var tabLearn: TextView? = null
    private var stageLine: TextView? = null
    private var stageText: TextView? = null
    private var moveText: TextView? = null
    private var noteText: TextView? = null
    private var progressText: TextView? = null
    private var prevBtn: TextView? = null
    private var nextBtn: TextView? = null
    private var autoBtn: TextView? = null
    private var speakBtn: TextView? = null

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speak = true

    private val autoStep = Runnable { if (autoPlay && screen == Screen.SOLVE) next() }

    private val pruneCache: File get() = File(filesDir, "pruning-v1.bin")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(BG_TOP, BG_BOTTOM))
            fitsSystemWindows = true
        }
        setContentView(root)
        speak = getPreferences(MODE_PRIVATE).getBoolean("speak", true)
        resetColors()
        // Dựng sẵn bảng tra của bộ giải trong lúc bé đang tô màu.
        Thread { TwoPhase.prepare(pruneCache) }.start()
        tts = try {
            TextToSpeech(this) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val r = tts?.setLanguage(Locale("vi", "VN")) ?: TextToSpeech.LANG_NOT_SUPPORTED
                    ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
                }
            }
        } catch (e: Exception) {
            null
        }
        show(Screen.HOME)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        scanner?.close()
        tts?.shutdown()
        super.onDestroy()
    }

    override fun onPause() {
        super.onPause()
        autoPlay = false
        handler.removeCallbacks(autoStep)
        scanner?.close()
        tts?.stop()
    }

    override fun onResume() {
        super.onResume()
        // Camera đã đóng khi tạm dừng: dựng lại màn để mở lại.
        if (screen == Screen.INPUT && cameraOn) show(Screen.INPUT)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        show(screen)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when (screen) {
            Screen.HOME -> super.onBackPressed()
            Screen.SOLVE -> show(Screen.INPUT)
            Screen.INPUT -> if (faceStep > 0) goFace(faceStep - 1) else show(Screen.HOME)
        }
    }

    private fun resetColors() {
        for (i in 0 until 54) colors[i] = if (i % 9 == 4) Palette.defaultCenters[i / 9] else -1
        suspects = emptySet()
    }

    // ---------- Khung chung ----------

    private fun show(target: Screen) {
        autoPlay = false
        handler.removeCallbacks(autoStep)
        cube?.halt()
        scanner?.close()
        scanner = null
        overlay = null
        screen = target
        root.removeAllViews()
        cube = null
        when (target) {
            Screen.HOME -> buildHome()
            Screen.INPUT -> buildInput()
            Screen.SOLVE -> buildSolve()
        }
    }

    private fun dp(v: Number): Int = (v.toFloat() * resources.displayMetrics.density).toInt()

    private val landscape: Boolean
        get() = resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    private fun label(text: String, size: Float, color: Int = INK, bold: Boolean = false, center: Boolean = false) =
        TextView(this).apply {
            this.text = text
            setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            if (center) gravity = Gravity.CENTER
            setLineSpacing(0f, 1.1f)
        }

    private fun round(color: Int, radius: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private fun button(text: String, color: Int, textColor: Int = Color.WHITE, size: Float = 19f, onClick: () -> Unit) =
        label(text, size, textColor, bold = true, center = true).apply {
            background = RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), round(color, dp(28)), null)
            setPadding(dp(16), dp(13), dp(16), dp(13))
            elevation = dp(2).toFloat()
            isClickable = true
            setOnClickListener { onClick() }
        }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = round(Color.WHITE, dp(22))
        elevation = dp(3).toFloat()
        setPadding(dp(18), dp(14), dp(18), dp(16))
    }

    private fun topBar(title: String, extra: View? = null, back: () -> Unit): LinearLayout {
        val bar = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), dp(8), dp(10), dp(4))
        }
        bar.addView(button("‹ Về", Color.WHITE, INK, 17f) { back() }, LinearLayout.LayoutParams(-2, -2))
        bar.addView(
            label(title, 22f, INK, bold = true).apply { setPadding(dp(14), 0, 0, 0) },
            LinearLayout.LayoutParams(0, -2, 1f)
        )
        if (extra != null) bar.addView(extra, LinearLayout.LayoutParams(-2, -2))
        return bar
    }

    private fun lp(w: Int, h: Int, weight: Float = 0f, top: Int = 0) =
        LinearLayout.LayoutParams(w, h, weight).apply { topMargin = top }

    // ---------- Màn chính ----------

    private fun buildHome() {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(28), dp(24), dp(28))
        }
        col.addView(label("Rubik Bé", 42f, TITLE, bold = true, center = true))
        col.addView(label("Cùng nhau giải khối Rubik nào!", 18f, INK_SOFT, center = true), lp(-1, -2, top = dp(4)))
        val demo = CubeView(this).apply {
            colors = Palette.solved()
            autoSpin = true
        }
        val size = if (landscape) dp(170) else dp(230)
        col.addView(demo, LinearLayout.LayoutParams(size, size).apply { topMargin = dp(8) })

        val buttons = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        buttons.addView(button("🧩  Nhập khối của con", ORANGE, size = 21f) {
            resetColors()
            inputNote = null
            faceStep = 0
            show(Screen.INPUT)
        }, lp(-1, -2))
        if ((0 until 54).any { it % 9 != 4 && colors[it] >= 0 }) {
            buttons.addView(button("✏️  Sửa khối đang nhập", BLUE) {
                inputNote = null
                show(Screen.INPUT)
            }, lp(-1, -2, top = dp(12)))
        }
        buttons.addView(button("🎲  Khối mẫu để tập", GREEN) { sample() }, lp(-1, -2, top = dp(12)))
        col.addView(buttons, LinearLayout.LayoutParams(dp(340), -2).apply { topMargin = dp(12) })

        val hint = card()
        hint.addView(label("Cách cầm khối", 17f, TITLE, bold = true))
        hint.addView(
            label("Ô giữa màu VÀNG ở trên, ô giữa màu XANH LÁ quay về phía con. Giữ nguyên như vậy trong lúc làm theo hướng dẫn nhé!", 16f, INK),
            lp(-1, -2, top = dp(4))
        )
        col.addView(hint, LinearLayout.LayoutParams(dp(340), -2).apply { topMargin = dp(20) })

        val scroll = ScrollView(this).apply { isFillViewport = true }
        scroll.addView(col)
        root.addView(scroll)
    }

    private fun sample() {
        val seq = Moves.scramble(Random(), 20)
        val faces = CubieCube().apply(seq).toFacelets()
        for (i in 0 until 54) colors[i] = Palette.defaultCenters[faces[i]]
        sampleScramble = Moves.text(seq)
        startSolve()
    }

    // ---------- Nhập màu từng mặt ----------

    private fun centerName(face: Int) = Palette.names[colors[face * 9 + 4]].uppercase(Locale("vi", "VN"))

    /** Lời dặn cách cầm khối cho mặt thứ [k] (thứ tự: trước, phải, sau, trái, trên, dưới). */
    private fun hint(k: Int): String = when (k) {
        0 -> "Cầm khối cho ô giữa ${centerName(Faces.U)} ở trên, ô giữa ${centerName(Faces.F)} nhìn vào con. Tô 9 ô giống hệt mặt con đang nhìn."
        1 -> "Xoay cả khối sang TRÁI một nấc. Giờ ô giữa ${centerName(Faces.R)} nhìn vào con, ${centerName(Faces.U)} vẫn ở trên."
        2 -> "Xoay sang TRÁI thêm một nấc: ô giữa ${centerName(Faces.B)} nhìn vào con."
        3 -> "Xoay sang TRÁI thêm một nấc: ô giữa ${centerName(Faces.L)} nhìn vào con."
        4 -> "Xoay sang TRÁI cho ${centerName(Faces.F)} về lại trước mặt. Rồi lật khối cho mặt ${centerName(Faces.U)} nhìn vào con, ${centerName(Faces.F)} ở phía dưới."
        else -> "Lật ngược khối: mặt ${centerName(Faces.D)} nhìn vào con, ${centerName(Faces.F)} ở phía trên."
    }

    /** Màu ô giữa của 4 mặt quanh mặt [face]: trên, phải, dưới, trái (theo hướng bé đang nhìn). */
    private fun neighborColors(face: Int): IntArray {
        val c = Geometry.pos[face * 9 + 4]
        fun dir(i: Int) = IntArray(3) { Geometry.pos[face * 9 + i][it] - c[it] }
        val dirs = listOf(dir(1), dir(5), dir(7), dir(3))
        return IntArray(4) { k ->
            val f = (0 until 6).first { Geometry.axis[it].contentEquals(dirs[k]) }
            colors[f * 9 + 4]
        }
    }

    private fun buildInput() {
        val face = FACE_ORDER[faceStep]
        poseCube = null
        liveIds = null
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val camBtn = button(if (cameraOn) "🧊" else "📷", Color.WHITE, INK, 18f) { toggleCamera() }
        col.addView(topBar("Mặt ${faceStep + 1} / 6", camBtn) {
            if (faceStep > 0) goFace(faceStep - 1) else show(Screen.HOME)
        })

        stepHint = label(hint(faceStep), 18f, INK, bold = true).apply { setPadding(dp(18), dp(2), dp(18), dp(2)) }
        noteView = label("", 15f, 0xFFB4234A.toInt()).apply { setPadding(dp(18), 0, dp(18), 0) }

        // Hình minh hoạ: khối 3D xoay đúng tư thế, hoặc camera nếu bé bật.
        val visual = FrameLayout(this)
        if (cameraOn) {
            visual.addView(buildCamera(face), FrameLayout.LayoutParams(-1, -1))
        } else {
            val pose = CubeView(this).apply {
                colors = this@MainActivity.colors
                highlightFace = face
            }
            poseCube = pose
            val (y, p) = POSES[faceStep]
            pose.yaw = y
            pose.pitch = p
            visual.addView(pose, FrameLayout.LayoutParams(-1, -1))
        }

        val faceGrid = FaceGrid(this).apply {
            onCell = { i -> paintCell(face * 9 + i) }
        }
        grid = faceGrid

        val paletteRow = LinearLayout(this).apply {
            gravity = Gravity.CENTER
            setPadding(dp(6), dp(6), dp(6), dp(6))
        }
        swatches.clear()
        for (id in 0 until 6) {
            val v = label("", 15f, Palette.ink(id), bold = true, center = true).apply {
                isClickable = true
                contentDescription = Palette.names[id]
                setOnClickListener {
                    brush = id
                    refreshPalette()
                }
            }
            swatches.add(id to v)
            val size = if (landscape) dp(44) else dp(50)
            paletteRow.addView(v, LinearLayout.LayoutParams(size, size).apply { setMargins(dp(4), 0, dp(4), 0) })
        }

        val nav = LinearLayout(this).apply { setPadding(dp(14), dp(4), dp(14), dp(12)) }
        backBtn = button("◀", Color.WHITE, INK, 20f) { if (faceStep > 0) goFace(faceStep - 1) }
        val last = faceStep == 5
        forwardBtn = button(if (last) "Giải thôi! ✨" else "Mặt tiếp ▶", GREEN, size = 20f) {
            if (last) startSolve() else goFace(faceStep + 1)
        }
        nav.addView(backBtn, lp(dp(72), -2))
        nav.addView(forwardBtn, lp(0, -2, 1f).apply { leftMargin = dp(10) })

        if (landscape) {
            val row = LinearLayout(this)
            val left = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            left.addView(visual, lp(-1, 0, 1f))
            row.addView(left, lp(0, -1, 0.8f))
            row.addView(faceGrid, lp(0, -1, 1f))
            val side = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val scroll = ScrollView(this)
            val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            texts.addView(stepHint)
            texts.addView(noteView)
            scroll.addView(texts)
            side.addView(scroll, lp(-1, 0, 1f))
            side.addView(paletteRow)
            side.addView(nav)
            row.addView(side, lp(0, -1, 1.2f))
            col.addView(row, lp(-1, 0, 1f))
        } else {
            col.addView(stepHint)
            col.addView(noteView)
            col.addView(visual, lp(-1, 0, 0.75f))
            col.addView(faceGrid, lp(-1, 0, 1.25f))
            col.addView(paletteRow)
            col.addView(nav)
        }
        root.addView(col)
        refreshInput()
    }

    private fun buildCamera(face: Int): View {
        val holder = FrameLayout(this).apply { setBackgroundColor(0xFF101218.toInt()) }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
            holder.addView(label("Cho phép dùng camera để chụp màu nhé", 16f, Color.WHITE, center = true), FrameLayout.LayoutParams(-1, -1))
            return holder
        }
        val frame = AspectFrame(this)
        val cam = Scanner(
            this,
            onSample = { s ->
                val ids = ColorMath.classifyFace(s, colors[face * 9 + 4], learned)
                liveSamples = s
                liveIds = ids
                overlay?.live = ids
            },
            onSize = { w, h -> frame.aspect = w.toFloat() / h },
            onError = { msg ->
                runOnUiThread {
                    Toast.makeText(this, "$msg. Con tô màu bằng tay nhé!", Toast.LENGTH_LONG).show()
                    cameraOn = false
                    show(Screen.INPUT)
                }
            }
        )
        scanner = cam
        val grid = GridOverlay(this)
        overlay = grid
        frame.addView(cam.view, FrameLayout.LayoutParams(-1, -1))
        frame.addView(grid, FrameLayout.LayoutParams(-1, -1))
        holder.addView(frame, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        val take = button("📸 Lấy màu", BLUE, size = 17f) { takeFromCamera(face) }
        holder.addView(take, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply {
            setMargins(dp(8), dp(8), dp(8), dp(8))
        })
        return holder
    }

    private fun toggleCamera() {
        cameraOn = !cameraOn
        show(Screen.INPUT)
    }

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code != REQ_CAMERA) return
        if (results.isEmpty() || results[0] != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Không có quyền camera, con tô màu bằng tay nhé", Toast.LENGTH_LONG).show()
            cameraOn = false
        }
        if (screen == Screen.INPUT) show(Screen.INPUT)
    }

    private fun takeFromCamera(face: Int) {
        val ids = liveIds
        if (ids == null) {
            Toast.makeText(this, "Đợi camera lên hình đã nhé", Toast.LENGTH_SHORT).show()
            return
        }
        for (i in 0 until 9) if (i != 4) colors[face * 9 + i] = ids[i]
        // Ghi nhớ màu thật của ô giữa để đoán các mặt sau chính xác hơn.
        liveSamples?.let { learned[colors[face * 9 + 4]] = ColorMath.lab(it[4]) }
        clearSuspects(face)
        overlay?.animate()?.alpha(0.2f)?.setDuration(90)?.withEndAction { overlay?.animate()?.alpha(1f)?.setDuration(160) }
        inputNote = "Máy đã đoán màu. Ô nào chưa giống khối thật thì chọn màu đúng rồi chạm vào để sửa."
        refreshInput()
    }

    private fun clearSuspects(face: Int) {
        suspects = suspects.filter { it / 9 != face }.toSet()
    }

    private fun paintCell(index: Int) {
        if (brush == -2) {
            Toast.makeText(this, "Con chọn một màu ở dưới trước nhé", Toast.LENGTH_SHORT).show()
            return
        }
        if (index % 9 == 4 && colors[index] != brush) {
            // Ô giữa quyết định tên mặt: hỏi lại cho chắc.
            AlertDialog.Builder(this)
                .setMessage("Đổi màu ô giữa thành ${Palette.names[brush].lowercase()}? Chỉ đổi nếu khối của con khác màu thật.")
                .setPositiveButton("Đổi") { _, _ ->
                    colors[index] = brush
                    show(Screen.INPUT)
                }
                .setNegativeButton("Thôi", null)
                .show()
            return
        }
        colors[index] = brush
        suspects = suspects - index
        refreshInput()
    }

    private fun goFace(k: Int) {
        if (k == faceStep) return
        val old = faceStep
        faceStep = k
        inputNote = null
        show(Screen.INPUT)
        // Xoay khối minh hoạ y như động tác bé cần làm.
        val pose = poseCube ?: return
        pose.yaw = POSES[old].first
        pose.pitch = POSES[old].second
        pose.animateView(POSES[k].first, POSES[k].second)
    }

    private fun refreshInput() {
        val face = FACE_ORDER[faceStep]
        grid?.cells = IntArray(9) { colors[face * 9 + it] }
        grid?.neighbors = neighborColors(face)
        grid?.suspects = suspects.filter { it / 9 == face }.map { it % 9 }.toSet()
        poseCube?.colors = colors
        val filled = (0 until 9).count { colors[face * 9 + it] >= 0 }
        noteView?.text = inputNote ?: when {
            brush == -2 -> "Chọn một màu ở dưới, rồi chạm (hoặc vuốt) vào các ô."
            filled < 9 -> "Còn ${9 - filled} ô chưa tô ở mặt này."
            else -> "Xong mặt này rồi! 👍"
        }
        refreshPalette()
    }

    private fun refreshPalette() {
        val count = IntArray(6)
        for (c in colors) if (c >= 0) count[c]++
        for ((id, v) in swatches) {
            val left = 9 - count[id]
            v.text = left.toString()
            v.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Palette.color(id))
                if (id == brush) setStroke(dp(4), INK) else setStroke(dp(1), 0x33000000)
            }
            v.setTextColor(if (left < 0) 0xFFE11D48.toInt() else Palette.ink(id))
            v.alpha = if (left == 0 && id != brush) 0.45f else 1f
            v.scaleX = if (id == brush) 1.15f else 1f
            v.scaleY = v.scaleX
        }
    }

    private fun startSolve() {
        val names = Array(6) { Palette.names[it] }
        val result = InputCheck.check(colors, names)
        val cubie = result.cube
        if (cubie == null) {
            suspects = result.suspects
            val firstFace = suspects.map { it / 9 }.minByOrNull { FACE_ORDER.indexOf(it) }
            if (firstFace != null) faceStep = FACE_ORDER.indexOf(firstFace)
            inputNote = result.message
            cameraOn = false
            show(Screen.INPUT)
            AlertDialog.Builder(this)
                .setTitle("Ơ, hình như chưa đúng")
                .setMessage(result.message + if (suspects.isNotEmpty()) "\n\nCác ô cần xem lại có viền đỏ." else "")
                .setPositiveButton("Để con xem lại", null)
                .show()
            return
        }
        if (screen == Screen.INPUT) sampleScramble = null
        suspects = emptySet()
        startColors = colors.copyOf()
        fastSteps = null
        learnSteps = null
        solveError = null
        stepIndex = 0
        celebrated = false
        lastSpokenIndex = -1
        val token = ++solveToken
        val centerNames = Array(6) { Palette.names[colors[it * 9 + 4]] }
        Thread {
            var fast: List<Step>? = null
            var learn: List<Step>? = null
            try {
                TwoPhase.prepare(pruneCache)
                val sol = TwoPhase.solve(cubie, 1500, 22)
                if (sol != null && cubie.apply(sol).isSolved()) fast = sol.map { Step(it, 0, "") }
            } catch (e: Throwable) {
                // Dùng cách giải từng tầng thay thế.
            }
            try {
                val steps = Beginner.solve(cubie) { centerNames[it] }
                if (cubie.apply(steps.map { it.move }.toIntArray()).isSolved()) learn = steps
            } catch (e: Throwable) {
                // Dùng cách giải nhanh thay thế.
            }
            runOnUiThread {
                if (token != solveToken) return@runOnUiThread
                fastSteps = fast ?: learn
                learnSteps = learn ?: fast
                if (fastSteps == null) solveError = "Xin lỗi, máy chưa tìm được cách giải khối này."
                if (screen == Screen.SOLVE) refreshSolve()
            }
        }.start()
        show(Screen.SOLVE)
    }

    // ---------- Giải ----------

    private fun steps(): List<Step>? = if (learnMode) learnSteps else fastSteps

    private fun buildSolve() {
        speakBtn = button(if (speak) "🔊" else "🔇", Color.WHITE, INK, 18f) {
            speak = !speak
            getPreferences(MODE_PRIVATE).edit().putBoolean("speak", speak).apply()
            speakBtn?.text = if (speak) "🔊" else "🔇"
            if (!speak) tts?.stop() else {
                lastSpokenIndex = -1
                speakCurrent()
            }
        }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(topBar("Giải khối", speakBtn) { show(Screen.INPUT) })

        val tabs = LinearLayout(this).apply {
            background = round(0x80FFFFFF.toInt(), dp(24))
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        tabFast = button("⚡ Giải nhanh", Color.WHITE, INK, 16f) { setMode(false) }
        tabLearn = button("📚 Học giải", Color.WHITE, INK, 16f) { setMode(true) }
        tabs.addView(tabFast, lp(0, -2, 1f))
        tabs.addView(tabLearn, lp(0, -2, 1f).apply { leftMargin = dp(6) })

        val view = CubeView(this)
        cube = view
        view.colors = stateAt(stepIndex)

        val info = card()
        stageLine = label("", 15f, TITLE, bold = true)
        stageText = label("", 15f, INK_SOFT)
        moveText = label("", 23f, INK, bold = true)
        noteText = label("", 14f, INK_SOFT)
        progressText = label("", 14f, INK_SOFT)
        info.addView(stageLine)
        info.addView(stageText, lp(-1, -2, top = dp(2)))
        info.addView(moveText, lp(-1, -2, top = dp(10)))
        info.addView(noteText, lp(-1, -2, top = dp(2)))
        info.addView(progressText, lp(-1, -2, top = dp(6)))

        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        prevBtn = button("◀", Color.WHITE, INK, 22f) { prev() }
        nextBtn = button("Tiếp ▶", GREEN, size = 21f) { next() }
        autoBtn = button("▶▶", Color.WHITE, INK, 18f) { toggleAuto() }
        controls.addView(prevBtn, lp(dp(70), -2))
        controls.addView(nextBtn, lp(0, -2, 1f).apply { setMargins(dp(10), 0, dp(10), 0) })
        controls.addView(autoBtn, lp(dp(70), -2))

        val reset = label("↺ Góc nhìn ban đầu", 14f, INK_SOFT, center = true).apply {
            setPadding(0, dp(6), 0, dp(6))
            setOnClickListener { cube?.resetView() }
        }

        if (landscape) {
            val row = LinearLayout(this)
            val left = FrameLayout(this)
            left.addView(view, FrameLayout.LayoutParams(-1, -1))
            row.addView(left, lp(0, -1, 1f))
            val side = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(8), 0, dp(16), dp(12))
            }
            side.addView(tabs)
            val scroll = ScrollView(this)
            scroll.addView(info)
            side.addView(scroll, lp(-1, 0, 1f, top = dp(10)))
            side.addView(controls, lp(-1, -2, top = dp(10)))
            side.addView(reset)
            row.addView(side, lp(0, -1, 1f))
            col.addView(row, lp(-1, 0, 1f))
        } else {
            val body = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), 0, dp(14), dp(12))
            }
            body.addView(tabs)
            body.addView(view, lp(-1, 0, 1f))
            body.addView(reset)
            body.addView(info)
            body.addView(controls, lp(-1, -2, top = dp(10)))
            col.addView(body, lp(-1, 0, 1f))
        }
        root.addView(col)
        refreshSolve()
    }

    /** Màu của khối sau [n] bước đầu của lời giải đang xem. */
    private fun stateAt(n: Int): IntArray {
        var c = startColors.copyOf()
        val list = steps() ?: return c
        for (i in 0 until n.coerceAtMost(list.size)) c = Geometry.apply(c, list[i].move)
        return c
    }

    private fun setMode(learn: Boolean) {
        if (cube?.busy == true) return
        if (learnMode == learn) return
        learnMode = learn
        autoPlay = false
        handler.removeCallbacks(autoStep)
        stepIndex = 0
        celebrated = false
        lastSpokenIndex = -1
        cube?.colors = startColors.copyOf()
        cube?.resetView()
        refreshSolve()
    }

    private fun styleTab(tab: TextView?, active: Boolean) {
        tab ?: return
        tab.background = RippleDrawable(
            ColorStateList.valueOf(0x30000000),
            round(if (active) TITLE else Color.WHITE, dp(22)), null
        )
        tab.setTextColor(if (active) Color.WHITE else INK)
    }

    private fun refreshSolve() {
        if (screen != Screen.SOLVE) return
        styleTab(tabFast, !learnMode)
        styleTab(tabLearn, learnMode)
        val list = steps()
        val error = solveError
        val busy = cube?.busy == true
        when {
            error != null -> {
                stageLine?.text = "Ôi!"
                stageText?.text = ""
                moveText?.text = error
                noteText?.text = "Con quay lại kiểm tra màu đã tô nhé."
                progressText?.text = ""
                cube?.pendingMove = -1
                enableControls(prev = false, next = false)
                return
            }
            list == null -> {
                stageLine?.text = if (TwoPhase.ready) "Đang suy nghĩ…" else "Đang chuẩn bị (chỉ lâu ở lần đầu)…"
                stageText?.text = ""
                moveText?.text = "Chờ một chút nhé 🤔"
                noteText?.text = ""
                progressText?.text = ""
                cube?.pendingMove = -1
                enableControls(prev = false, next = false)
                return
            }
        }
        val steps = list!!
        val total = steps.size
        if (total == 0) {
            stageLine?.text = "Khối đã được giải rồi! 🎉"
            stageText?.text = "Con xáo khối lên rồi thử lại nhé."
            moveText?.text = ""
            noteText?.text = ""
            progressText?.text = ""
            cube?.pendingMove = -1
            enableControls(prev = false, next = false)
            return
        }
        if (stepIndex >= total) {
            stageLine?.text = "Hoàn thành! 🎉"
            stageText?.text = "Khối Rubik đã được giải xong."
            moveText?.text = "Con giỏi quá!"
            noteText?.text = if (learnMode) "Thử chế độ Giải nhanh để xem cách giải ngắn hơn nhé." else "Thử chế độ Học giải để học cách tự giải nhé."
            progressText?.text = "Đã làm $total / $total bước"
            cube?.pendingMove = -1
            enableControls(prev = !busy, next = false)
            celebrate()
            return
        }
        val step = steps[stepIndex]
        if (learnMode) {
            val stage = Beginner.stages[step.stage]
            stageLine?.text = "Giai đoạn ${step.stage + 1}/7 · ${stage.title}"
            stageText?.text = stage.text
            noteText?.text = step.note + "  (ký hiệu: ${Moves.name(step.move)})"
        } else {
            stageLine?.text = "Giải nhanh · $total bước"
            stageText?.text = if (stepIndex == 0 && sampleScramble != null)
                "Khối mẫu. Muốn tập với khối thật: cầm vàng trên, xanh lá trước, xoay theo: $sampleScramble"
            else "Làm theo từng bước, mỗi lần xong thì bấm Tiếp."
            noteText?.text = "Ký hiệu: ${Moves.name(step.move)}"
        }
        moveText?.text = describe(step.move)
        progressText?.text = "Bước ${stepIndex + 1} / $total"
        if (!busy) cube?.pendingMove = step.move
        enableControls(prev = stepIndex > 0 && !busy, next = !busy)
        autoBtn?.text = if (autoPlay) "⏸" else "▶▶"
        speakCurrent()
    }

    private fun enableControls(prev: Boolean, next: Boolean) {
        prevBtn?.isEnabled = prev
        prevBtn?.alpha = if (prev) 1f else 0.4f
        nextBtn?.isEnabled = next
        nextBtn?.alpha = if (next) 1f else 0.4f
        autoBtn?.isEnabled = next || autoPlay
        autoBtn?.alpha = if (next || autoPlay) 1f else 0.4f
    }

    private fun next() {
        val list = steps() ?: return
        val view = cube ?: return
        if (view.busy || stepIndex >= list.size) return
        val m = list[stepIndex].move
        view.pendingMove = -1
        enableControls(prev = false, next = false)
        view.animateMove(m) {
            stepIndex++
            refreshSolve()
            if (autoPlay) {
                if (stepIndex < list.size) handler.postDelayed(autoStep, 650) else autoPlay = false
            }
        }
    }

    private fun prev() {
        val list = steps() ?: return
        val view = cube ?: return
        if (view.busy || stepIndex == 0) return
        autoPlay = false
        handler.removeCallbacks(autoStep)
        val m = Moves.inverse(list[stepIndex - 1].move)
        view.pendingMove = -1
        enableControls(prev = false, next = false)
        view.animateMove(m) {
            stepIndex--
            celebrated = false
            refreshSolve()
        }
    }

    private fun toggleAuto() {
        autoPlay = !autoPlay
        handler.removeCallbacks(autoStep)
        autoBtn?.text = if (autoPlay) "⏸" else "▶▶"
        if (autoPlay) next()
    }

    private fun speakCurrent() {
        if (!speak || !ttsReady || stepIndex == lastSpokenIndex) return
        val list = steps() ?: return
        if (stepIndex >= list.size) return
        lastSpokenIndex = stepIndex
        val step = list[stepIndex]
        val newStage = learnMode && (stepIndex == 0 || list[stepIndex - 1].stage != step.stage)
        val text = if (newStage) "Giai đoạn ${step.stage + 1}: ${Beginner.stages[step.stage].title}. ${describe(step.move)}"
        else describe(step.move)
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "step")
    }

    private fun celebrate() {
        if (celebrated) return
        celebrated = true
        autoPlay = false
        val confetti = ConfettiView(this)
        confetti.onDone = { root.removeView(confetti) }
        root.addView(confetti, FrameLayout.LayoutParams(-1, -1))
        if (speak && ttsReady) tts?.speak("Hoan hô! Con đã giải xong khối Rubik rồi!", TextToSpeech.QUEUE_FLUSH, null, "done")
    }

    /** Lời hướng dẫn dễ hiểu, khi cầm khối vàng ở trên, xanh lá quay về phía mình. */
    private fun describe(m: Int): String {
        val face = FACE_NAMES[m / 3]
        val power = m % 3
        if (power == 1) return "Xoay $face 2 lần"
        val cw = power == 0
        val dir = when (m / 3) {
            Faces.U -> if (cw) "sang trái" else "sang phải"
            Faces.D -> if (cw) "sang phải" else "sang trái"
            Faces.R -> if (cw) "lên trên" else "xuống dưới"
            Faces.L -> if (cw) "xuống dưới" else "lên trên"
            Faces.F -> if (cw) "theo chiều kim đồng hồ" else "ngược chiều kim đồng hồ"
            else -> if (cw) "ngược chiều kim đồng hồ (nhìn từ phía trước)" else "theo chiều kim đồng hồ (nhìn từ phía trước)"
        }
        return "Xoay $face $dir"
    }

    companion object {
        private const val REQ_CAMERA = 1
        private const val INK = 0xFF2B2D42.toInt()
        private const val INK_SOFT = 0xFF5C6178.toInt()
        private const val TITLE = 0xFF4B3FD8.toInt()
        private const val BLUE = 0xFF2F80ED.toInt()
        private const val ORANGE = 0xFFFF8A00.toInt()
        private const val GREEN = 0xFF1FAE63.toInt()
        private const val BG_TOP = 0xFFFFF4DE.toInt()
        private const val BG_BOTTOM = 0xFFDDEEFF.toInt()

        private val FACE_NAMES = arrayOf("mặt trên", "mặt phải", "mặt trước", "mặt dưới", "mặt trái", "mặt sau")

        /** Thứ tự nhập: trước, phải, sau, trái, trên, dưới (xoay sang trái liên tục rồi lật). */
        private val FACE_ORDER = intArrayOf(Faces.F, Faces.R, Faces.B, Faces.L, Faces.U, Faces.D)

        /** Góc nhìn khối minh hoạ cho từng mặt (yaw, pitch), hơi chếch để thấy mặt bên cạnh. */
        private val POSES = arrayOf(
            -20f to 18f, -110f to 18f, -200f to 18f, -290f to 18f, -380f to 70f, -380f to -70f
        )
    }
}
