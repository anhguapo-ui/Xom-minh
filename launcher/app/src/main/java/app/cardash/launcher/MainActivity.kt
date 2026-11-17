package app.cardash.launcher

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.role.RoleManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Màn hình chính: bản đồ có tốc độ GPS, các thẻ thời tiết / nhạc / đồng hồ / app hay dùng,
 * thanh dock ghim app và trang lưới toàn bộ ứng dụng.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var repo: AppRepo
    private lateinit var media: MediaCenter
    private lateinit var location: LocationHub
    private lateinit var weather: Weather

    private var landscape = false
    private var unit = 0f // 1% cạnh ngắn của màn hình, để chữ và icon co giãn theo màn
    private var showGrid = false
    private var showHidden = false
    private var query = ""
    private var visibleApps: List<AppEntry> = emptyList()

    private lateinit var background: ImageView
    private lateinit var root: LinearLayout
    private lateinit var dashPage: View
    private lateinit var gridPage: View
    private lateinit var toggle: ImageView
    private lateinit var dockClock: TextView
    private lateinit var map: MapView
    private lateinit var recenter: ImageView
    private lateinit var speedText: TextView
    private lateinit var mapStatus: TextView
    private lateinit var weatherIcon: ImageView
    private lateinit var weatherTemp: TextView
    private lateinit var weatherRange: TextView
    private lateinit var weatherDesc: TextView
    private lateinit var bigClock: TextView
    private lateinit var dateLine: TextView
    private lateinit var lunarLine: TextView
    private lateinit var songArt: ImageView
    private lateinit var songScrim: View
    private lateinit var songTitle: TextView
    private lateinit var songArtist: TextView
    private lateinit var playButton: ImageView
    private lateinit var search: EditText
    private lateinit var gridTitle: TextView
    private val dockSlots = ArrayList<ImageView>()
    private val shortcutIcons = ArrayList<ImageView>()
    private val gridAdapter = GridAdapter()

    private val wallpaperFile: File get() = File(filesDir, "wallpaper.jpg")

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
        Ui.accent = Ui.ACCENTS[prefs.accent.coerceIn(0, Ui.ACCENTS.size - 1)]
        repo = AppRepo(this)
        media = MediaCenter(this) { updateMedia() }
        location = LocationHub(this) { updateLocation() }
        weather = Weather { updateWeather() }

        val dm = resources.displayMetrics
        landscape = resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        unit = minOf(dm.widthPixels, dm.heightPixels) / 100f

        buildUi()
        registerReceiver(packageReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        })
        reloadApps()

        if (!location.hasPermission() && !prefs.askedLocation) {
            prefs.askedLocation = true
            askLocation()
        }
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
        location.start()
        updateLocation()
        updateWeather()
    }

    override fun onStop() {
        unregisterReceiver(timeReceiver)
        media.stop()
        location.stop()
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

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == REQ_LOCATION) {
            location.start()
            updateLocation()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        if (requestCode == REQ_WALLPAPER && resultCode == RESULT_OK && uri != null) importWallpaper(uri)
    }

    // ---------- Dựng giao diện ----------

    private fun dp(v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private fun u(v: Float): Int = (unit * v).toInt()

    private fun TextView.px(size: Float) = setTextSize(TypedValue.COMPLEX_UNIT_PX, size)

    private val radius: Float get() = unit * 3.6f
    private val hairline: Int get() = maxOf(1, dp(1f))

    private fun buildUi() {
        val gap = u(1.5f)
        val frame = FrameLayout(this)
        background = ImageView(this)
        frame.addView(background, FrameLayout.LayoutParams(-1, -1))
        applyWallpaper()

        root = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            fitsSystemWindows = true
            isFocusableInTouchMode = true
        }
        // Lớp đệm bên trong để cộng thêm lề người dùng tự chỉnh mà không đè lên lề hệ thống.
        val inner = LinearLayout(this).apply {
            orientation = root.orientation
            setPadding(gap, gap + prefs.padTop * u(2f), gap, gap + prefs.padBottom * u(2f))
        }
        val content = FrameLayout(this)
        dashPage = buildDash()
        gridPage = buildGrid()
        content.addView(dashPage, FrameLayout.LayoutParams(-1, -1))
        content.addView(gridPage, FrameLayout.LayoutParams(-1, -1))
        val dock = buildDock()
        val dockSize = u(12.5f)
        if (landscape) {
            inner.addView(dock, LinearLayout.LayoutParams(dockSize, -1).apply { rightMargin = gap })
            inner.addView(content, LinearLayout.LayoutParams(0, -1, 1f))
        } else {
            inner.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
            inner.addView(dock, LinearLayout.LayoutParams(-1, dockSize).apply { topMargin = gap })
        }
        root.addView(inner, LinearLayout.LayoutParams(-1, -1))
        frame.addView(root, FrameLayout.LayoutParams(-1, -1))
        setContentView(frame)
        showPage(showGrid)
    }

    private fun applyWallpaper() {
        val bmp = if (prefs.wallpaperImage && wallpaperFile.exists()) {
            BitmapFactory.decodeFile(wallpaperFile.path)
        } else null
        if (bmp != null) {
            background.scaleType = ImageView.ScaleType.CENTER_CROP
            background.setImageBitmap(bmp)
        } else {
            background.scaleType = ImageView.ScaleType.FIT_XY
            background.setImageDrawable(Ui.wallpaper(prefs.wallpaper))
        }
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        background = Ui.glass(radius, hairline)
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
            background = Ui.glass(radius, hairline)
            val pad = u(1.2f)
            setPadding(pad, pad, pad, pad)
        }
        val cell = u(9.5f)
        val space = u(1.4f)

        toggle = iconButton(Glyph.GRID, cell).apply {
            contentDescription = "Chuyển giữa trang chính và danh sách ứng dụng"
            setOnClickListener { showPage(!showGrid) }
            setOnLongClickListener { openSettings(); true }
        }
        dockClock = Ui.text(this, 16f, bold = true, center = true).apply { px(unit * 3.8f) }

        dockSlots.clear()
        val slots = ArrayList<View>()
        for (i in 0 until Prefs.SLOTS) {
            val slot = ImageView(this).apply {
                background = Ui.pressable(0x00000000, cell * 0.225f)
                setOnClickListener { onSlotClick(Prefs.DOCK, i) }
                setOnLongClickListener { onSlotLongClick(Prefs.DOCK, i); true }
            }
            dockSlots.add(slot)
            slots.add(slot)
        }
        fun slotParams() = LinearLayout.LayoutParams(cell, cell).apply {
            if (landscape) topMargin = space else leftMargin = space
        }
        fun spacer() = dock.addView(
            View(this),
            if (landscape) LinearLayout.LayoutParams(1, 0, 1f) else LinearLayout.LayoutParams(0, 1, 1f)
        )

        if (landscape) {
            dock.addView(dockClock, LinearLayout.LayoutParams(-2, -2))
            slots.forEach { dock.addView(it, slotParams()) }
            spacer()
            dock.addView(toggle, LinearLayout.LayoutParams(cell, cell))
        } else {
            dock.addView(toggle, LinearLayout.LayoutParams(cell, cell))
            slots.forEach { dock.addView(it, slotParams()) }
            spacer()
            dock.addView(dockClock, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = u(1.5f) })
        }
        return dock
    }

    private fun buildDash(): View {
        val gap = u(1.5f)
        val dash = LinearLayout(this).apply {
            orientation = if (landscape) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
        }
        val rowA = LinearLayout(this)
        rowA.addView(buildWeatherCard(), LinearLayout.LayoutParams(0, -1, 1f))
        rowA.addView(buildMusicCard(), LinearLayout.LayoutParams(0, -1, 1f).apply { leftMargin = gap })
        val rowB = LinearLayout(this)
        rowB.addView(buildClockCard(), LinearLayout.LayoutParams(0, -1, 1f))
        rowB.addView(buildShortcutCard(), LinearLayout.LayoutParams(0, -1, 1f).apply { leftMargin = gap })
        val panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        panel.addView(rowA, LinearLayout.LayoutParams(-1, 0, 1f))
        panel.addView(rowB, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = gap })

        val mapCard = buildMapCard()
        if (landscape) {
            dash.addView(mapCard, LinearLayout.LayoutParams(0, -1, 1f))
            dash.addView(panel, LinearLayout.LayoutParams(0, -1, 1.15f).apply { leftMargin = gap })
        } else {
            dash.addView(mapCard, LinearLayout.LayoutParams(-1, 0, 1.3f))
            dash.addView(panel, LinearLayout.LayoutParams(-1, 0, 1.2f).apply { topMargin = gap })
        }
        return dash
    }

    private fun buildMapCard(): View {
        val card = FrameLayout(this).apply { background = Ui.glass(radius, hairline) }
        Ui.clipRound(card, radius)
        val m = u(1.8f)
        val btn = u(8.5f)

        map = MapView(this).apply {
            accent = Ui.accent
            onTap = { openMaps() }
            onFollowChanged = { recenter.visibility = if (it) View.GONE else View.VISIBLE }
        }
        card.addView(map, FrameLayout.LayoutParams(-1, -1))

        // Ô tìm kiếm: mở Google Maps để nhập điểm đến.
        val find = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.pressable(0xF01C2029.toInt(), btn / 2f)
            setPadding(u(1.2f), 0, u(3.5f), 0)
            setOnClickListener { openMaps() }
            addView(
                ImageView(context).apply { setImageDrawable(Glyph(Glyph.SEARCH, Ui.accent)) },
                LinearLayout.LayoutParams(u(6f), u(6f))
            )
            addView(
                Ui.text(context, 16f).apply { px(unit * 3.4f); text = "Tìm kiếm" },
                LinearLayout.LayoutParams(-2, -2).apply { leftMargin = u(1f) }
            )
        }
        card.addView(find, FrameLayout.LayoutParams(-2, btn, Gravity.TOP or Gravity.START).apply {
            setMargins(m, m, m, m)
        })

        recenter = iconButton(Glyph.TARGET, btn).apply {
            background = Ui.pressable(0xF01C2029.toInt(), btn / 2f)
            contentDescription = "Về vị trí hiện tại"
            visibility = View.GONE
            setOnClickListener { map.recenter() }
        }
        card.addView(recenter, FrameLayout.LayoutParams(btn, btn, Gravity.TOP or Gravity.END).apply {
            setMargins(m, m, m, m)
        })

        val zoom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.rounded(0xF01C2029.toInt(), btn / 2f)
            addView(iconButton(Glyph.PLUS, btn).apply {
                contentDescription = "Phóng to"
                setOnClickListener { map.zoomBy(1) }
            }, LinearLayout.LayoutParams(btn, btn))
            addView(iconButton(Glyph.MINUS, btn).apply {
                contentDescription = "Thu nhỏ"
                setOnClickListener { map.zoomBy(-1) }
            }, LinearLayout.LayoutParams(btn, btn))
        }
        card.addView(zoom, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply {
            setMargins(m, m, m, m)
        })

        // Huy hiệu tốc độ.
        val badge = u(13f)
        val speed = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xF2101318.toInt())
                setStroke(maxOf(2, u(0.5f)), Ui.accent)
            }
        }
        speedText = Ui.text(this, 22f, bold = true, center = true).apply { px(unit * 5f) }
        speed.addView(speedText, LinearLayout.LayoutParams(-2, -2))
        speed.addView(
            Ui.text(this, 10f, Ui.TEXT_DIM, center = true).apply { px(unit * 2.1f); text = "km/h" },
            LinearLayout.LayoutParams(-2, -2)
        )
        card.addView(speed, FrameLayout.LayoutParams(badge, badge, Gravity.BOTTOM or Gravity.END).apply {
            setMargins(m, m, m, m)
        })

        // Dòng trạng thái: chuyến đi, hoặc nhắc cấp quyền / chờ GPS.
        mapStatus = Ui.text(this, 13f, center = true).apply {
            px(unit * 2.9f)
            background = Ui.pressable(0xF01C2029.toInt(), u(3.5f).toFloat())
            setPadding(u(2.5f), u(1.4f), u(2.5f), u(1.4f))
            setOnClickListener { if (!location.hasPermission()) askLocation() }
            setOnLongClickListener {
                if (location.tripMeters > 0) {
                    location.resetTrip()
                    toast("Đã đặt lại chuyến đi")
                }
                true
            }
        }
        card.addView(
            mapStatus,
            FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
                setMargins(m, m, m, m + u(2.5f))
            }
        )

        card.addView(
            Ui.text(this, 9f, 0x99FFFFFF.toInt()).apply { px(unit * 1.7f); text = "© OpenStreetMap" },
            FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
                bottomMargin = u(0.6f)
            }
        )
        return card
    }

    private fun buildWeatherCard(): View {
        val card = card().apply {
            gravity = Gravity.CENTER
            setPadding(u(2f), u(2f), u(2f), u(2f))
            setOnClickListener {
                val loc = location.last
                if (loc == null) {
                    if (!location.hasPermission()) askLocation() else toast("Chưa có vị trí để xem thời tiết")
                } else {
                    weather.refresh(loc.latitude, loc.longitude, force = true)
                    toast("Đang cập nhật thời tiết")
                }
            }
        }
        weatherIcon = ImageView(this)
        card.addView(weatherIcon, LinearLayout.LayoutParams(u(15f), u(15f)))
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        weatherTemp = Ui.text(this, 40f).apply {
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            px(unit * 10f)
        }
        weatherRange = Ui.text(this, 14f, Ui.TEXT_DIM).apply { px(unit * 3f) }
        weatherDesc = Ui.text(this, 14f, lines = 2).apply { px(unit * 3f) }
        col.addView(weatherTemp, LinearLayout.LayoutParams(-2, -2))
        col.addView(weatherRange, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(0.6f) })
        col.addView(weatherDesc, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(0.6f) })
        card.addView(col, LinearLayout.LayoutParams(-2, -2).apply { leftMargin = u(1.5f) })
        return card
    }

    private fun buildClockCard(): View {
        val card = card().apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(u(2f), u(2f), u(2f), u(2f))
        }
        bigClock = Ui.text(this, 48f, center = true).apply {
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            px(unit * 13f)
        }
        dateLine = Ui.text(this, 15f, center = true).apply { px(unit * 3.2f) }
        lunarLine = Ui.text(this, 13f, Ui.TEXT_DIM, center = true).apply { px(unit * 2.8f) }
        card.addView(bigClock, LinearLayout.LayoutParams(-2, -2))
        card.addView(dateLine, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(1f) })
        card.addView(lunarLine, LinearLayout.LayoutParams(-2, -2).apply { topMargin = u(0.8f) })
        return card
    }

    private fun buildMusicCard(): View {
        val card = FrameLayout(this).apply { background = Ui.glass(radius, hairline) }
        Ui.clipRound(card, radius)
        // Ảnh bìa phủ kín thẻ, có lớp tối phía trên để chữ dễ đọc.
        songArt = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
        }
        songScrim = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(0x8C000000.toInt(), 0xD9000000.toInt())
            )
            visibility = View.GONE
        }
        card.addView(songArt, FrameLayout.LayoutParams(-1, -1))
        card.addView(songScrim, FrameLayout.LayoutParams(-1, -1))

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(u(2.5f), u(2.5f), u(2.5f), u(2f))
            setOnClickListener { openPlayer() }
        }
        songTitle = Ui.text(this, 18f, bold = true).apply { px(unit * 3.8f) }
        songArtist = Ui.text(this, 14f, Ui.TEXT_DIM, lines = 2).apply { px(unit * 2.9f) }
        col.addView(songTitle, LinearLayout.LayoutParams(-1, -2))
        col.addView(songArtist, LinearLayout.LayoutParams(-1, -2).apply { topMargin = u(0.8f) })
        col.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))

        val btn = u(9.5f)
        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER }
        val prev = iconButton(Glyph.PREV, btn).apply {
            contentDescription = "Bài trước"
            setOnClickListener { media.previous() }
        }
        playButton = ImageView(this).apply {
            background = Ui.pressable(Ui.accent, btn / 2f)
            setPadding(btn / 4, btn / 5, btn / 4, btn / 5)
            contentDescription = "Phát hoặc tạm dừng"
            setOnClickListener { media.playPause() }
        }
        val next = iconButton(Glyph.NEXT, btn).apply {
            contentDescription = "Bài kế"
            setOnClickListener { media.next() }
        }
        controls.addView(prev, LinearLayout.LayoutParams(btn, btn))
        controls.addView(playButton, LinearLayout.LayoutParams((btn * 1.5f).toInt(), btn).apply {
            leftMargin = u(1.5f); rightMargin = u(1.5f)
        })
        controls.addView(next, LinearLayout.LayoutParams(btn, btn))
        col.addView(controls, LinearLayout.LayoutParams(-1, -2))
        card.addView(col, FrameLayout.LayoutParams(-1, -1))
        return card
    }

    /** Thẻ app hay dùng: 2 hàng x 3 ô. */
    private fun buildShortcutCard(): View {
        val card = card().apply {
            orientation = LinearLayout.VERTICAL
            setPadding(u(1.2f), u(1.2f), u(1.2f), u(1.2f))
        }
        shortcutIcons.clear()
        val size = u(10.5f)
        val perRow = Prefs.SLOTS / 2
        for (r in 0 until 2) {
            val row = LinearLayout(this)
            for (c in 0 until perRow) {
                val i = r * perRow + c
                val icon = ImageView(this).apply {
                    background = Ui.pressable(0x00000000, size * 0.225f)
                    setOnClickListener { onSlotClick(Prefs.SHORTCUTS, i) }
                    setOnLongClickListener { onSlotLongClick(Prefs.SHORTCUTS, i); true }
                }
                shortcutIcons.add(icon)
                val cell = FrameLayout(this)
                cell.addView(icon, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
                row.addView(cell, LinearLayout.LayoutParams(0, -1, 1f))
            }
            card.addView(row, LinearLayout.LayoutParams(-1, 0, 1f))
        }
        return card
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
            background = Ui.glass(bar / 2f, hairline)
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
        header.addView(search, LinearLayout.LayoutParams(u(40f), bar))
        val gear = iconButton(Glyph.GEAR, bar).apply {
            background = Ui.glass(bar / 2f, hairline)
            contentDescription = "Cài đặt"
            setOnClickListener { openSettings() }
        }
        header.addView(gear, LinearLayout.LayoutParams(bar, bar).apply { leftMargin = u(1.5f) })
        page.addView(header, LinearLayout.LayoutParams(-1, -2))

        val panel = FrameLayout(this).apply { background = Ui.glass(radius, hairline) }
        Ui.clipRound(panel, radius)
        val grid = GridView(this).apply {
            numColumns = GridView.AUTO_FIT
            columnWidth = u(21f)
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            verticalSpacing = u(1f)
            selector = Ui.pressable(0x00000000, unit * 3f)
            isVerticalScrollBarEnabled = false
            clipToPadding = false
            setPadding(u(1f), u(1f), u(1f), u(1f))
            adapter = gridAdapter
            setOnItemClickListener { _, _, pos, _ -> launch(visibleApps[pos]) }
            setOnItemLongClickListener { _, _, pos, _ -> openAppMenu(visibleApps[pos]); true }
        }
        panel.addView(grid, FrameLayout.LayoutParams(-1, -1))
        page.addView(panel, LinearLayout.LayoutParams(-1, 0, 1f))
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

    private fun updateLocation() {
        val loc = location.last
        if (loc != null) {
            map.setLocation(loc.latitude, loc.longitude)
            weather.refresh(loc.latitude, loc.longitude)
        }
        speedText.text = location.speedKmh.toInt().toString()
        val status = when {
            !location.hasPermission() -> "Chạm để bật định vị"
            loc == null -> "Chờ tín hiệu GPS"
            location.tripMeters >= 50 -> {
                val minutes = location.movingMs / 60_000
                minutes.toString() + " phút · " +
                    String.format(Locale("vi", "VN"), "%.1f km", location.tripMeters / 1000.0)
            }
            else -> ""
        }
        mapStatus.text = status
        mapStatus.visibility = if (status.isEmpty()) View.GONE else View.VISIBLE
    }

    private fun updateWeather() {
        val t = weather.temp
        if (t == null) {
            weatherIcon.setImageDrawable(Glyph(Glyph.CLOUD, Ui.TEXT_DIM))
            weatherTemp.text = "--°"
            weatherRange.text = ""
            weatherDesc.text = if (location.hasPermission()) "Đang chờ thời tiết" else "Cần quyền vị trí"
            return
        }
        val sunny = weather.glyph == Glyph.SUN
        weatherIcon.setImageDrawable(Glyph(weather.glyph, if (sunny) 0xFFFFC83D.toInt() else Ui.TEXT))
        weatherTemp.text = "$t°"
        weatherRange.text = "Cao " + weather.high + "° · Thấp " + weather.low + "°"
        weatherDesc.text = weather.description
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
        songArt.setImageBitmap(art)
        songArt.visibility = if (art != null) View.VISIBLE else View.GONE
        songScrim.visibility = songArt.visibility
        playButton.setImageDrawable(
            Glyph(if (media.isPlaying) Glyph.PAUSE else Glyph.PLAY, 0xFF0B0E13.toInt())
        )
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
        for (i in dockSlots.indices) bindSlot(dockSlots[i], repo.byKey(dock[i]))
        val shortcuts = prefs.slots(Prefs.SHORTCUTS)
        for (i in shortcutIcons.indices) bindSlot(shortcutIcons[i], repo.byKey(shortcuts[i]))
    }

    private fun bindSlot(icon: ImageView, app: AppEntry?) {
        if (app != null) {
            icon.setPadding(0, 0, 0, 0)
            icon.contentDescription = app.label
            repo.bind(icon, app)
        } else {
            icon.tag = null
            icon.contentDescription = "Thêm ứng dụng"
            val pad = (icon.layoutParams?.width ?: u(10f)) / 4
            icon.setPadding(pad, pad, pad, pad)
            icon.setImageDrawable(Glyph(Glyph.PLUS, Ui.TEXT_DIM))
        }
    }

    /** Lần đầu chạy: tự điền vài app quen thuộc nếu máy có cài. */
    private fun seedDefaults() {
        if (prefs.seeded || repo.all.isEmpty()) return
        prefs.seeded = true
        val known = listOf(
            "com.google.android.apps.maps", "com.google.android.youtube", "com.zing.mp3",
            "com.spotify.music", "com.android.chrome", "com.android.settings",
            "com.google.android.apps.youtube.music", "com.vietmap.s1OBU", "com.waze",
            "com.android.dialer", "com.google.android.dialer", "com.android.vending"
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

    private fun askLocation() {
        requestPermissions(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            REQ_LOCATION
        )
    }

    /** Mở Google Maps; máy không có thì mở app bản đồ bất kỳ. */
    private fun openMaps() {
        val intent = packageManager.getLaunchIntentForPackage("com.google.android.apps.maps")
            ?: Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0"))
        open(intent)
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
            "Ghim vào thanh dock",
            "Thêm vào thẻ app hay dùng",
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
                    startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_HOME)
                    return
                } catch (e: Exception) {
                    // Rơi xuống cách mở trang cài đặt bên dưới.
                }
            }
        }
        if (!open(Intent(Settings.ACTION_HOME_SETTINGS))) open(Intent(Settings.ACTION_SETTINGS))
    }

    /** Chép ảnh người dùng chọn vào bộ nhớ riêng (thu nhỏ nếu quá lớn) rồi dùng làm nền. */
    private fun importWallpaper(uri: Uri) {
        Thread {
            try {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2400) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                val bmp = contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, options)
                } ?: throw IllegalStateException("Không giải mã được ảnh")
                FileOutputStream(wallpaperFile).use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
                runOnUiThread {
                    prefs.wallpaperImage = true
                    applyWallpaper()
                }
            } catch (e: Exception) {
                runOnUiThread { toast("Không đọc được ảnh này") }
            }
        }.start()
    }

    private fun openSettings() {
        val items = arrayOf(
            if (isDefaultHome()) "Màn hình chính mặc định: đang là CarDash" else "Đặt làm màn hình chính mặc định",
            if (media.hasAccess()) "Quyền điều khiển nhạc: đã cấp" else "Cấp quyền hiện tên bài hát",
            if (location.hasPermission()) "Quyền vị trí: đã cấp" else "Cấp quyền vị trí (bản đồ, tốc độ, thời tiết)",
            "Chọn ảnh nền từ máy",
            "Dùng nền màu / đổi màu nền",
            "Màu nhấn: " + Ui.ACCENT_NAMES[prefs.accent.coerceIn(0, Ui.ACCENTS.size - 1)],
            "Chỉnh lề trên / dưới",
            if (showHidden) "Giấu lại các ứng dụng đã ẩn" else "Hiện cả ứng dụng đã ẩn",
            "Đặt lại số liệu chuyến đi",
            "Cài đặt hệ thống"
        )
        AlertDialog.Builder(this)
            .setTitle("Cài đặt CarDash")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> openHomeSettings()
                    1 -> open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                    2 -> if (location.hasPermission()) toast("Đã có quyền vị trí") else askLocation()
                    3 -> try {
                        startActivityForResult(
                            Intent(Intent.ACTION_GET_CONTENT).setType("image/*")
                                .addCategory(Intent.CATEGORY_OPENABLE),
                            REQ_WALLPAPER
                        )
                    } catch (e: Exception) {
                        toast("Máy này không có trình chọn ảnh")
                    }
                    4 -> {
                        if (prefs.wallpaperImage) prefs.wallpaperImage = false
                        else prefs.wallpaper = (prefs.wallpaper + 1) % Ui.WALLPAPERS.size
                        applyWallpaper()
                    }
                    5 -> {
                        prefs.accent = (prefs.accent + 1) % Ui.ACCENTS.size
                        recreate()
                    }
                    6 -> openPadding()
                    7 -> {
                        showHidden = !showHidden
                        refreshGrid()
                        showPage(true)
                    }
                    8 -> location.resetTrip()
                    9 -> open(Intent(Settings.ACTION_SETTINGS))
                }
            }
            .show()
    }

    /** Dành cho màn có thanh điều khiển của xe che mất mép trên hoặc dưới. */
    private fun openPadding() {
        val items = arrayOf("Tăng lề trên", "Giảm lề trên", "Tăng lề dưới", "Giảm lề dưới")
        AlertDialog.Builder(this)
            .setTitle("Lề trên " + prefs.padTop + " · lề dưới " + prefs.padBottom)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> prefs.padTop += 1
                    1 -> prefs.padTop -= 1
                    2 -> prefs.padBottom += 1
                    3 -> prefs.padBottom -= 1
                }
                buildUi()
                refreshSlots()
                refreshGrid()
                updateClock()
                updateMedia()
                updateLocation()
                updateWeather()
                openPadding()
            }
            .setPositiveButton("Xong", null)
            .show()
    }

    companion object {
        private const val REQ_HOME = 1
        private const val REQ_LOCATION = 2
        private const val REQ_WALLPAPER = 3
    }
}
