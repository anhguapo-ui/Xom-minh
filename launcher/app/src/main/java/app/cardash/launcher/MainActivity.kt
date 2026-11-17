package app.cardash.launcher

import android.app.Activity
import android.app.AlertDialog
import android.app.role.RoleManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Outline
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Màn hình chính: thanh bên, trang tổng quan (đồng hồ, nhạc, lối tắt) và lưới ứng dụng. */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var repo: AppRepo
    private lateinit var media: MediaCenter

    private var landscape = true
    private var unit = 0f // 1% cạnh ngắn của màn hình, để chữ và icon co giãn theo màn
    private var showGrid = false
    private var showHidden = false
    private var query = ""
    private var visibleApps: List<AppEntry> = emptyList()

    private lateinit var root: LinearLayout
    private lateinit var dashPage: View
    private lateinit var gridPage: View
    private lateinit var toggle: ImageView
    private lateinit var dockClock: TextView
    private lateinit var bigClock: TextView
    private lateinit var dateLine: TextView
    private lateinit var lunarLine: TextView
    private lateinit var songTitle: TextView
    private lateinit var songArtist: TextView
    private lateinit var albumArt: ImageView
    private lateinit var playButton: ImageView
    private lateinit var search: EditText
    private lateinit var gridTitle: TextView
    private val dockSlots = ArrayList<ImageView>()
    private val shortcutIcons = ArrayList<ImageView>()
    private val shortcutLabels = ArrayList<TextView>()
    private val gridAdapter = GridAdapter()

    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) = updateClock()
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.data?.schemeSpecificPart?.let { repo.forget(it) }
            reloadApps()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        repo = AppRepo(this)
        media = MediaCenter(this) { updateMedia() }

        val dm = resources.displayMetrics
        landscape = resources.configuration.orientation != Configuration.ORIENTATION_PORTRAIT
        unit = minOf(dm.widthPixels, dm.heightPixels) / 100f

        buildUi()
        registerReceiver(packageReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        })
        reloadApps()
    }

    override fun onDestroy() {
        unregisterReceiver(packageReceiver)
        super.onDestroy()
    }

    override fun onStart() {
        super.onStart()
        registerReceiver(timeReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
        })
        updateClock()
        media.start()
    }

    override fun onStop() {
        unregisterReceiver(timeReceiver)
        media.stop()
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        updateClock()
        if (!prefs.askedDefault && !isDefaultHome()) {
            prefs.askedDefault = true
            AlertDialog.Builder(this)
                .setTitle("Đặt CarDash làm màn hình chính?")
                .setMessage("Khi đặt làm mặc định, bật máy hoặc bấm nút Home sẽ vào thẳng CarDash.")
                .setPositiveButton("Đặt ngay") { _, _ -> openHomeSettings() }
                .setNegativeButton("Để sau", null)
                .show()
        }
    }

    /** Bấm nút Home khi đang ở launcher: quay về trang tổng quan. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        if (intent?.hasCategory(Intent.CATEGORY_HOME) == true) showPage(false)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Launcher không được thoát; nút Back chỉ đưa về trang tổng quan.
        if (showGrid) showPage(false)
    }

    // ---------- Dựng giao diện ----------

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private fun u(v: Float): Int = (unit * v).toInt()

    private fun TextView.px(size: Float) = setTextSize(TypedValue.COMPLEX_UNIT_PX, size)

    private fun buildUi() {
        val gap = u(1.6f)
        root = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            background = Ui.wallpaper(prefs.wallpaper)
            fitsSystemWindows = true
            isFocusableInTouchMode = true
            setPadding(gap, gap, gap, gap)
        }
        val content = FrameLayout(this)
        dashPage = buildDash()
        gridPage = buildGrid()
        content.addView(dashPage, FrameLayout.LayoutParams(-1, -1))
        content.addView(gridPage, FrameLayout.LayoutParams(-1, -1))
        val dock = buildDock()
        val dockSize = u(13f)
        if (landscape) {
            root.addView(dock, LinearLayout.LayoutParams(dockSize, -1).apply { rightMargin = gap })
            root.addView(content, LinearLayout.LayoutParams(0, -1, 1f))
        } else {
            root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
            root.addView(dock, LinearLayout.LayoutParams(-1, dockSize).apply { topMargin = gap })
        }
        setContentView(root)
        showPage(false)
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        background = Ui.rounded(Ui.CARD, unit * 4f)
    }

    private fun iconButton(kind: Int, size: Int): ImageView = ImageView(this).apply {
        setImageDrawable(Glyph(kind))
        background = Ui.pressable(0x00000000, size / 2f)
        val pad = size / 5
        setPadding(pad, pad, pad, pad)
        isClickable = true
    }

    private fun buildDock(): View {
        val dock = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            background = Ui.rounded(Ui.DOCK, unit * 4f)
            val pad = u(1.2f)
            setPadding(pad, pad, pad, pad)
        }
        val cell = u(9.5f)
        val space = u(1.4f)
        fun params() = LinearLayout.LayoutParams(cell, cell).apply {
            if (landscape) topMargin = space else leftMargin = space
        }

        dockClock = Ui.text(this, 16f, bold = true, center = true).apply { px(unit * 3.6f) }
        dock.addView(dockClock, LinearLayout.LayoutParams(-2, -2))

        dockSlots.clear()
        for (i in 0 until Prefs.SLOTS) {
            val slot = ImageView(this).apply {
                background = Ui.pressable(0x00000000, cell * 0.225f)
                setOnClickListener { onSlotClick(Prefs.DOCK, i) }
                setOnLongClickListener { onSlotLongClick(Prefs.DOCK, i); true }
            }
            dockSlots.add(slot)
            dock.addView(slot, params())
        }

        dock.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f).apply {
            if (landscape) width = 1 else height = 1
        })

        toggle = iconButton(Glyph.GRID, cell).apply {
            background = Ui.pressable(0x33FFFFFF, cell * 0.3f)
            contentDescription = "Chuyển giữa trang chính và danh sách ứng dụng"
            setOnClickListener { showPage(!showGrid) }
            setOnLongClickListener { openSettings(); true }
        }
        dock.addView(toggle, LinearLayout.LayoutParams(cell, cell))
        return dock
    }

    private fun buildDash(): View {
        val gap = u(1.6f)
        val dash = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        }

        // Thẻ đồng hồ
        val clock = card().apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(u(3f), u(3f), u(3f), u(3f))
        }
        bigClock = Ui.text(this, 64f, center = true).apply {
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            px(unit * 21f)
        }
        dateLine = Ui.text(this, 20f, center = true).apply { px(unit * 4.4f) }
        lunarLine = Ui.text(this, 15f, Ui.TEXT_DIM, center = true).apply { px(unit * 3.2f) }
        clock.addView(bigClock, LinearLayout.LayoutParams(-2, -2))
        clock.addView(dateLine, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(1.5f) })
        clock.addView(lunarLine, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(1.2f) })

        // Thẻ nhạc
        val music = card().apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(u(2.5f), u(2.5f), u(2.5f), u(2.5f))
        }
        val artSize = u(19f)
        albumArt = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = Ui.pressable(0x33FFFFFF, unit * 3f)
            clipToOutline = true
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, unit * 3f)
                }
            }
            setOnClickListener { openPlayer() }
        }
        music.addView(albumArt, LinearLayout.LayoutParams(artSize, artSize))
        val info = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        songTitle = Ui.text(this, 20f, bold = true).apply { px(unit * 4.2f) }
        songArtist = Ui.text(this, 15f, Ui.TEXT_DIM).apply { px(unit * 3.2f) }
        info.addView(songTitle, LinearLayout.LayoutParams(-1, -2))
        info.addView(songArtist, LinearLayout.LayoutParams(-1, -2).apply { topMargin = u(0.8f) })
        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val btn = u(10.5f)
        val prev = iconButton(Glyph.PREV, btn).apply {
            contentDescription = "Bài trước"
            setOnClickListener { media.previous() }
        }
        playButton = iconButton(Glyph.PLAY, btn).apply {
            background = Ui.pressable(0x33FFFFFF, btn / 2f)
            contentDescription = "Phát hoặc tạm dừng"
            setOnClickListener { media.playPause() }
        }
        val next = iconButton(Glyph.NEXT, btn).apply {
            contentDescription = "Bài kế"
            setOnClickListener { media.next() }
        }
        controls.addView(prev, LinearLayout.LayoutParams(btn, btn))
        controls.addView(playButton, LinearLayout.LayoutParams(btn, btn).apply {
            leftMargin = u(2f); rightMargin = u(2f)
        })
        controls.addView(next, LinearLayout.LayoutParams(btn, btn))
        info.addView(controls, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(1.8f) })
        info.setOnClickListener { openPlayer() }
        music.addView(info, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = u(2.5f) })

        // Thẻ lối tắt
        val shortcuts = card().apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(u(1.5f), u(1.5f), u(1.5f), u(1.5f))
        }
        shortcutIcons.clear()
        shortcutLabels.clear()
        val iconSize = u(13f)
        for (i in 0 until Prefs.SLOTS) {
            val tile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                background = Ui.pressable(0x00000000, unit * 3f)
                setOnClickListener { onSlotClick(Prefs.SHORTCUTS, i) }
                setOnLongClickListener { onSlotLongClick(Prefs.SHORTCUTS, i); true }
            }
            val icon = ImageView(this)
            val label = Ui.text(this, 13f, center = true).apply { px(unit * 2.9f) }
            tile.addView(icon, LinearLayout.LayoutParams(iconSize, iconSize))
            tile.addView(label, LinearLayout.LayoutParams(-1, -2).apply { topMargin = u(1.2f) })
            shortcutIcons.add(icon)
            shortcutLabels.add(label)
            shortcuts.addView(tile, LinearLayout.LayoutParams(0, -1, 1f))
        }

        val right = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        right.addView(music, LinearLayout.LayoutParams(-1, 0, 1f))
        right.addView(shortcuts, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = gap })

        if (landscape) {
            dash.addView(clock, LinearLayout.LayoutParams(0, -1, 1f))
            dash.addView(right, LinearLayout.LayoutParams(0, -1, 1.35f).apply { leftMargin = gap })
        } else {
            dash.addView(clock, LinearLayout.LayoutParams(-1, 0, 1f))
            dash.addView(right, LinearLayout.LayoutParams(-1, 0, 1.6f).apply { topMargin = gap })
        }
        return dash
    }

    private fun buildGrid(): View {
        val page = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(u(1.5f), 0, 0, u(1.5f))
        }
        gridTitle = Ui.text(this, 22f, bold = true).apply { px(unit * 4.6f) }
        header.addView(gridTitle, LinearLayout.LayoutParams(0, -2, 1f))

        val bar = u(9f)
        search = EditText(this).apply {
            hint = "Tìm ứng dụng"
            setHintTextColor(Ui.TEXT_DIM)
            setTextColor(Ui.TEXT)
            px(unit * 3.4f)
            setSingleLine()
            imeOptions = EditorInfo.IME_ACTION_SEARCH or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            background = Ui.rounded(Ui.CARD, bar / 2f)
            setPadding(u(3f), 0, u(3f), 0)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    query = s?.toString()?.trim() ?: ""
                    refreshGrid()
                }
            })
        }
        header.addView(search, LinearLayout.LayoutParams(u(42f), bar))
        val gear = iconButton(Glyph.GEAR, bar).apply {
            background = Ui.pressable(Ui.CARD, bar / 2f)
            contentDescription = "Cài đặt"
            setOnClickListener { openSettings() }
        }
        header.addView(gear, LinearLayout.LayoutParams(bar, bar).apply { leftMargin = u(1.5f) })
        page.addView(header, LinearLayout.LayoutParams(-1, -2))

        val grid = GridView(this).apply {
            numColumns = GridView.AUTO_FIT
            columnWidth = u(21f)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            verticalSpacing = u(1f)
            selector = Ui.pressable(0x00000000, unit * 3f)
            isVerticalScrollBarEnabled = false
            clipToPadding = false
            adapter = gridAdapter
            setOnItemClickListener { _, _, pos, _ -> launch(visibleApps[pos]) }
            setOnItemLongClickListener { _, _, pos, _ -> openAppMenu(visibleApps[pos]); true }
        }
        page.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        return page
    }

    private inner class GridAdapter : BaseAdapter() {
        override fun getCount() = visibleApps.size
        override fun getItem(position: Int) = visibleApps[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val cell = (convertView as? LinearLayout) ?: LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(u(0.5f), u(1.6f), u(0.5f), u(1.2f))
                val size = u(13.5f)
                addView(ImageView(context), LinearLayout.LayoutParams(size, size))
                addView(
                    Ui.text(context, 13f, lines = 2, center = true).apply {
                        px(unit * 2.8f)
                        minLines = 2
                    },
                    LinearLayout.LayoutParams(-1, -2).apply { topMargin = u(1.1f) }
                )
            }
            val app = visibleApps[position]
            repo.bind(cell.getChildAt(0) as ImageView, app)
            (cell.getChildAt(1) as TextView).apply {
                text = app.label
                alpha = if (app.key in prefs.hidden) 0.45f else 1f
            }
            return cell
        }
    }

    // ---------- Cập nhật nội dung ----------

    private fun showPage(grid: Boolean) {
        showGrid = grid
        dashPage.visibility = if (grid) View.GONE else View.VISIBLE
        gridPage.visibility = if (grid) View.VISIBLE else View.GONE
        toggle.setImageDrawable(Glyph(if (grid) Glyph.DASH else Glyph.GRID))
        if (!grid) {
            if (search.text.isNotEmpty()) search.setText("")
            hideKeyboard()
        }
    }

    private fun hideKeyboard() {
        search.clearFocus()
        root.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(root.windowToken, 0)
    }

    private fun updateClock() {
        val now = Date()
        val time = android.text.format.DateFormat.getTimeFormat(this).format(now)
        dockClock.text = time
        bigClock.text = time
        val vi = Locale("vi", "VN")
        dateLine.text = SimpleDateFormat("EEEE, d MMMM", vi).format(now)
            .replaceFirstChar { it.titlecase(vi) }
        val cal = Calendar.getInstance()
        val l = Lunar.of(
            cal.get(Calendar.DAY_OF_MONTH), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.YEAR)
        )
        lunarLine.text = "Âm lịch " + l.d + "/" + l.m + (if (l.leap) " nhuận" else "")
    }

    private fun updateMedia() {
        val title = media.title
        when {
            title != null -> {
                songTitle.text = title
                songArtist.text = media.artist ?: ""
            }
            !media.hasAccess() -> {
                songTitle.text = "Điều khiển nhạc"
                songArtist.text = "Chạm để cho phép hiện tên bài hát"
            }
            else -> {
                songTitle.text = "Chưa phát nhạc"
                songArtist.text = "Bấm phát để nghe tiếp"
            }
        }
        val art = media.art
        if (art != null) {
            albumArt.setPadding(0, 0, 0, 0)
            albumArt.setImageBitmap(art)
        } else {
            val pad = u(4.5f)
            albumArt.setPadding(pad, pad, pad, pad)
            albumArt.setImageDrawable(Glyph(Glyph.NOTE, Ui.TEXT_DIM))
        }
        playButton.setImageDrawable(Glyph(if (media.isPlaying) Glyph.PAUSE else Glyph.PLAY))
    }

    private fun reloadApps() {
        repo.reload {
            seedDefaults()
            refreshSlots()
            refreshGrid()
        }
    }

    private fun refreshGrid() {
        val hidden = prefs.hidden
        val q = query.lowercase()
        visibleApps = repo.all.filter {
            (showHidden || it.key !in hidden) && (q.isEmpty() || it.label.lowercase().contains(q))
        }
        gridTitle.text = if (showHidden) "Ứng dụng (kể cả đã ẩn)" else "Ứng dụng"
        gridAdapter.notifyDataSetChanged()
    }

    private fun refreshSlots() {
        val dock = prefs.slots(Prefs.DOCK)
        for (i in dockSlots.indices) bindSlot(dockSlots[i], null, repo.byKey(dock[i]))
        val shortcuts = prefs.slots(Prefs.SHORTCUTS)
        for (i in shortcutIcons.indices) {
            bindSlot(shortcutIcons[i], shortcutLabels[i], repo.byKey(shortcuts[i]))
        }
    }

    private fun bindSlot(icon: ImageView, label: TextView?, app: AppEntry?) {
        if (app != null) {
            icon.setPadding(0, 0, 0, 0)
            icon.contentDescription = app.label
            repo.bind(icon, app)
            label?.text = app.label
        } else {
            icon.tag = null
            icon.contentDescription = "Thêm ứng dụng"
            val pad = (icon.layoutParams?.width ?: u(10f)) / 4
            icon.setPadding(pad, pad, pad, pad)
            icon.setImageDrawable(Glyph(Glyph.PLUS, Ui.TEXT_DIM))
            label?.text = "Thêm"
        }
    }

    /** Lần đầu chạy: tự điền vài app quen thuộc nếu máy có cài. */
    private fun seedDefaults() {
        if (prefs.seeded || repo.all.isEmpty()) return
        prefs.seeded = true
        val known = listOf(
            "com.google.android.apps.maps", "com.vietmap.s1OBU", "com.waze",
            "com.google.android.youtube", "com.spotify.music", "com.zing.mp3",
            "com.google.android.apps.youtube.music", "com.android.chrome",
            "com.android.dialer", "com.google.android.dialer", "com.android.settings"
        )
        val found = known.mapNotNull { pkg -> repo.all.firstOrNull { it.pkg == pkg } }
        val dock = found.take(Prefs.SLOTS).map { it.key }
        val shortcuts = found.drop(Prefs.SLOTS).take(Prefs.SLOTS).map { it.key }
        prefs.setSlots(Prefs.DOCK, dock + List(Prefs.SLOTS - dock.size) { "" })
        prefs.setSlots(Prefs.SHORTCUTS, shortcuts + List(Prefs.SLOTS - shortcuts.size) { "" })
    }

    // ---------- Hành động ----------

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun launch(app: AppEntry) {
        hideKeyboard()
        try {
            startActivity(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_LAUNCHER)
                    .setComponent(app.component)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            )
        } catch (e: Exception) {
            toast("Không mở được " + app.label)
        }
    }

    private fun onSlotClick(listKey: String, index: Int) {
        val app = repo.byKey(prefs.slots(listKey)[index])
        if (app != null) launch(app) else pickApp(listKey, index)
    }

    private fun onSlotLongClick(listKey: String, index: Int) {
        val app = repo.byKey(prefs.slots(listKey)[index])
        if (app == null) {
            pickApp(listKey, index)
            return
        }
        AlertDialog.Builder(this)
            .setTitle(app.label)
            .setItems(arrayOf("Đổi ứng dụng khác", "Bỏ khỏi vị trí này")) { _, which ->
                if (which == 0) pickApp(listKey, index) else setSlot(listKey, index, "")
            }
            .show()
    }

    private fun setSlot(listKey: String, index: Int, key: String) {
        val list = prefs.slots(listKey)
        // Một app chỉ nằm ở một ô trong cùng danh sách.
        if (key.isNotEmpty()) for (i in list.indices) if (list[i] == key) list[i] = ""
        list[index] = key
        prefs.setSlots(listKey, list)
        refreshSlots()
    }

    /** Hộp chọn một ứng dụng để đặt vào ô [index]. */
    private fun pickApp(listKey: String, index: Int) {
        val apps = repo.all
        if (apps.isEmpty()) {
            toast("Chưa đọc xong danh sách ứng dụng")
            return
        }
        val adapter = object : BaseAdapter() {
            override fun getCount() = apps.size
            override fun getItem(position: Int) = apps[position]
            override fun getItemId(position: Int) = position.toLong()
            override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
                val row = (convertView as? LinearLayout) ?: LinearLayout(this@MainActivity).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(20f), dp(8f), dp(20f), dp(8f))
                    addView(ImageView(context), LinearLayout.LayoutParams(dp(44f), dp(44f)))
                    addView(
                        Ui.text(context, 17f),
                        LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(16f) }
                    )
                }
                repo.bind(row.getChildAt(0) as ImageView, apps[position])
                (row.getChildAt(1) as TextView).text = apps[position].label
                return row
            }
        }
        AlertDialog.Builder(this)
            .setTitle("Chọn ứng dụng")
            .setAdapter(adapter) { _, which -> setSlot(listKey, index, apps[which].key) }
            .setNegativeButton("Huỷ", null)
            .show()
    }

    /** Đặt [app] vào ô trống đầu tiên; hết ô thì hỏi thay ô nào. */
    private fun assign(listKey: String, app: AppEntry) {
        val list = prefs.slots(listKey)
        if (app.key in list) {
            toast("Ứng dụng này đã có sẵn ở đó")
            return
        }
        val free = list.indexOfFirst { repo.byKey(it) == null }
        if (free >= 0) {
            setSlot(listKey, free, app.key)
            toast("Đã thêm " + app.label)
            return
        }
        val names = list.mapIndexed { i, key -> "Thay ô " + (i + 1) + ": " + (repo.byKey(key)?.label ?: "") }
        AlertDialog.Builder(this)
            .setTitle("Các ô đã đầy")
            .setItems(names.toTypedArray()) { _, which -> setSlot(listKey, which, app.key) }
            .setNegativeButton("Huỷ", null)
            .show()
    }

    private fun openAppMenu(app: AppEntry) {
        val hidden = app.key in prefs.hidden
        val items = arrayOf(
            "Ghim vào thanh bên",
            "Đặt làm lối tắt trang chính",
            if (hidden) "Hiện lại trong danh sách" else "Ẩn khỏi danh sách",
            "Thông tin ứng dụng",
            "Gỡ cài đặt"
        )
        AlertDialog.Builder(this)
            .setTitle(app.label)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> assign(Prefs.DOCK, app)
                    1 -> assign(Prefs.SHORTCUTS, app)
                    2 -> {
                        prefs.hidden = if (hidden) prefs.hidden - app.key else prefs.hidden + app.key
                        refreshGrid()
                    }
                    3 -> open(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + app.pkg))
                    )
                    4 -> open(Intent(Intent.ACTION_DELETE, Uri.parse("package:" + app.pkg)))
                }
            }
            .show()
    }

    private fun open(intent: Intent): Boolean = try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: Exception) {
        toast("Máy này không hỗ trợ thao tác đó")
        false
    }

    /** Chạm vào thẻ nhạc: mở app đang phát, hoặc xin quyền nếu chưa có. */
    private fun openPlayer() {
        if (!media.hasAccess()) {
            open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            return
        }
        val pkg = media.controller?.packageName ?: return
        val intent = packageManager.getLaunchIntentForPackage(pkg) ?: return
        open(intent)
    }

    private fun isDefaultHome(): Boolean {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val info = packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return info?.activityInfo?.packageName == packageName
    }

    private fun openHomeSettings() {
        if (Build.VERSION.SDK_INT >= 29) {
            val roles = getSystemService(RoleManager::class.java)
            if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) &&
                !roles.isRoleHeld(RoleManager.ROLE_HOME)
            ) {
                try {
                    startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), 1)
                    return
                } catch (e: Exception) {
                    // Rơi xuống cách mở trang cài đặt bên dưới.
                }
            }
        }
        if (!open(Intent(Settings.ACTION_HOME_SETTINGS))) open(Intent(Settings.ACTION_SETTINGS))
    }

    private fun openSettings() {
        val items = arrayOf(
            if (isDefaultHome()) "Màn hình chính mặc định: đang là CarDash" else "Đặt làm màn hình chính mặc định",
            if (media.hasAccess()) "Quyền điều khiển nhạc: đã cấp" else "Cấp quyền hiện tên bài hát",
            "Đổi màu nền",
            if (showHidden) "Giấu lại các ứng dụng đã ẩn" else "Hiện cả ứng dụng đã ẩn",
            "Cài đặt hệ thống"
        )
        AlertDialog.Builder(this)
            .setTitle("Cài đặt CarDash")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> openHomeSettings()
                    1 -> open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    2 -> {
                        prefs.wallpaper = (prefs.wallpaper + 1) % Ui.WALLPAPERS.size
                        root.background = Ui.wallpaper(prefs.wallpaper)
                    }
                    3 -> {
                        showHidden = !showHidden
                        refreshGrid()
                        showPage(true)
                    }
                    4 -> open(Intent(Settings.ACTION_SETTINGS))
                }
            }
            .show()
    }
}
