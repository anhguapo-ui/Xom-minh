package app.rubikbe

/**
 * Kiểm tra màu bé đã tô. Khi có lỗi, đoán luôn chỗ bị tô nhầm để khoanh đỏ cho bé,
 * và nếu chắc chắn thì đưa ra bản đã sửa (nút "Sửa giúp con").
 * Các lỗi hay gặp: cả một mặt tô lệch hướng, một góc tô xoay vòng, một cạnh tô ngược,
 * một ô tô sai màu, hai ô tô đổi chỗ.
 */
object InputCheck {
    class Result(
        val cube: CubieCube?,
        val message: String?,
        val suspects: Set<Int>,
        /** Bản màu đã sửa, nếu app chắc chắn cách sửa. */
        val fix: IntArray? = null
    )

    private fun faces(colors: IntArray): IntArray? {
        val faceOf = IntArray(6) { -1 }
        for (f in 0 until 6) faceOf[colors[f * 9 + 4]] = f
        if (faceOf.any { it < 0 }) return null
        return IntArray(54) { faceOf[colors[it]] }
    }

    private fun valid(colors: IntArray): Boolean {
        val f = faces(colors) ?: return false
        return CubieCube.fromFacelets(f).second == CubieCube.OK
    }

    /** Xoay 9 ô của mặt [face] [quarter] lần 1/4 vòng theo chiều kim đồng hồ. */
    fun rotateFace(colors: IntArray, face: Int, quarter: Int): IntArray {
        val out = colors.copyOf()
        val base = face * 9
        var cur = IntArray(9) { colors[base + it] }
        repeat(quarter) {
            val prev = cur
            cur = IntArray(9) { i -> prev[(2 - i % 3) * 3 + i / 3] }
        }
        for (i in 0 until 9) out[base + i] = cur[i]
        return out
    }

    private fun faceName(colors: IntArray, face: Int, names: Array<String>) = names[colors[face * 9 + 4]].lowercase()

    fun check(colors: IntArray, names: Array<String>): Result {
        val empty = (0 until 54).filter { colors[it] < 0 }.toSet()
        if (empty.isNotEmpty()) return Result(null, "Còn ${empty.size} ô chưa tô màu (ô màu xám).", empty)

        val centers = IntArray(6) { colors[it * 9 + 4] }
        if (centers.distinct().size != 6) {
            return Result(null, "Sáu ô ở giữa sáu mặt phải là sáu màu khác nhau.", (0 until 6).map { it * 9 + 4 }.toSet())
        }

        val count = IntArray(6)
        for (c in colors) count[c]++
        val over = (0 until 6).filter { count[it] > 9 }
        val under = (0 until 6).filter { count[it] < 9 }
        if (over.isNotEmpty()) return countProblem(colors, names, count, over, under)

        val (cube, err) = CubieCube.fromFacelets(faces(colors)!!)
        if (err == CubieCube.OK) return Result(cube, null, emptySet())

        // 1. Cả một mặt tô lệch hướng (lỗi hay gặp nhất khi lật khối).
        val faceFixes = ArrayList<Pair<Int, IntArray>>()
        for (f in 0 until 6) for (q in 1..3) {
            val t = rotateFace(colors, f, q)
            if (valid(t)) faceFixes.add(f to t)
        }
        if (faceFixes.size == 1) {
            val (f, t) = faceFixes[0]
            val cells = (0 until 9).filter { it != 4 }.map { f * 9 + it }.toSet()
            return Result(
                null,
                "Mặt ${faceName(colors, f, names)} được tô đúng màu nhưng bị lệch hướng (xoay lệch khi lật khối). " +
                    "Bấm \"Sửa giúp con\" để app xoay lại cho đúng.",
                cells, t
            )
        }
        val pairFixes = ArrayList<Triple<Int, Int, IntArray>>()
        for (f in 0 until 6) for (g in f + 1 until 6) for (q in 1..3) for (r in 1..3) {
            val t = rotateFace(rotateFace(colors, f, q), g, r)
            if (valid(t)) pairFixes.add(Triple(f, g, t))
        }
        if (pairFixes.size == 1) {
            val (f, g, t) = pairFixes[0]
            val cells = (0 until 9).filter { it != 4 }.flatMap { listOf(f * 9 + it, g * 9 + it) }.toSet()
            return Result(
                null,
                "Mặt ${faceName(colors, f, names)} và mặt ${faceName(colors, g, names)} được tô đúng màu nhưng bị lệch hướng. " +
                    "Bấm \"Sửa giúp con\" để app xoay lại cho đúng.",
                cells, t
            )
        }

        // 2. Một góc tô xoay vòng, hoặc một cạnh tô ngược.
        val pieceFixes = ArrayList<Pair<Set<Int>, IntArray>>()
        for (q in CubieCube.cornerFacelet) for (shift in 1..2) {
            val t = colors.copyOf()
            for (k in 0 until 3) t[q[k]] = colors[q[(k + shift) % 3]]
            if (valid(t)) pieceFixes.add(q.toSet() to t)
        }
        for (q in CubieCube.edgeFacelet) {
            val t = colors.copyOf()
            t[q[0]] = colors[q[1]]
            t[q[1]] = colors[q[0]]
            if (valid(t)) pieceFixes.add(q.toSet() to t)
        }
        if (pieceFixes.size == 1) {
            val (cells, t) = pieceFixes[0]
            val kind = if (cells.size == 3) "góc" else "cạnh"
            return Result(
                null,
                "Miếng $kind có viền đỏ có đủ màu nhưng tô lệch chỗ giữa các ô. Bấm \"Sửa giúp con\", hoặc nhìn khối thật rồi tô lại các ô đó.",
                cells, t
            )
        }

        // 3. Hai ô bất kỳ bị tô đổi chỗ cho nhau.
        val swapCells = HashSet<Int>()
        var swapFix: IntArray? = null
        var swapCount = 0
        val trial = colors.copyOf()
        for (i in 0 until 54) {
            if (i % 9 == 4) continue
            for (j in i + 1 until 54) {
                if (j % 9 == 4 || colors[i] == colors[j]) continue
                trial[i] = colors[j]
                trial[j] = colors[i]
                if (valid(trial)) {
                    swapCells.add(i)
                    swapCells.add(j)
                    swapCount++
                    swapFix = trial.copyOf()
                }
                trial[i] = colors[i]
                trial[j] = colors[j]
            }
        }
        if (swapCount == 1) {
            return Result(null, "Hai ô có viền đỏ bị tô đổi màu cho nhau. Bấm \"Sửa giúp con\", hoặc nhìn khối thật rồi tô lại.", swapCells, swapFix)
        }
        if (swapCells.isNotEmpty() && swapCells.size <= 6) {
            return Result(null, "Hình như có hai ô bị tô đổi màu cho nhau. Con so với khối thật các ô có viền đỏ nhé.", swapCells)
        }

        // 4. Không đoán chắc được chỗ nào: nói rõ kiểu lỗi để bé biết tìm gì.
        val bad = impossiblePieces(faces(colors)!!)
        val parent = "\n(Bố mẹ: nếu đã so kỹ từng ô mà vẫn báo lỗi thì có thể khối từng bị tháo ra lắp lại sai.)"
        val message = when {
            bad.isNotEmpty() -> "Có miếng mang màu không thể có trên khối Rubik thật. Con so với khối thật các ô có viền đỏ nhé."
            err == CubieCube.ERR_TWIST -> "Có một miếng GÓC đủ 3 màu nhưng các màu bị tô lệch sang ô bên cạnh. Con so lại từng góc của khối nhé."
            err == CubieCube.ERR_FLIP -> "Có một miếng CẠNH có 2 màu bị tô ngược chỗ cho nhau. Con so lại từng cạnh của khối nhé."
            else -> "Có hai miếng bị tô đổi chỗ cho nhau. Con xoay khối và so lại từng mặt nhé."
        }
        return Result(null, message + parent, bad)
    }

    private fun countProblem(
        colors: IntArray, names: Array<String>, count: IntArray, over: List<Int>, under: List<Int>
    ): Result {
        val parts = over.map { "${names[it].lowercase()} thừa ${count[it] - 9} ô" } +
            under.map { "${names[it].lowercase()} thiếu ${9 - count[it]} ô" }
        var message = "Mỗi màu phải có đúng 9 ô. Đang có: ${parts.joinToString(", ")}."
        val suspects = HashSet<Int>()
        val fixes = HashSet<Int>()
        val trial = colors.copyOf()
        for (i in 0 until 54) {
            if (i % 9 == 4 || colors[i] !in over) continue
            for (u in under) {
                trial[i] = u
                if (valid(trial)) {
                    suspects.add(i)
                    fixes.add(u)
                }
            }
            trial[i] = colors[i]
        }
        if (suspects.isNotEmpty() && suspects.size <= 4) {
            message += " Ô có viền đỏ có thể phải là màu ${fixes.joinToString(" hoặc ") { names[it].lowercase() }}."
            return Result(null, message, suspects)
        }
        val overCells = (0 until 54).filter { it % 9 != 4 && colors[it] in over }.toSet()
        return Result(null, "$message Con xem lại các ô có viền đỏ nhé.", overCells)
    }

    /** Các ô thuộc góc/cạnh mang tổ hợp màu không tồn tại (ví dụ hai màu đối diện). */
    private fun impossiblePieces(f: IntArray): Set<Int> {
        val out = HashSet<Int>()
        for (cells in CubieCube.cornerFacelet) {
            val faces = cells.map { f[it] }
            val ok = CubieCube.cornerColor.any { it.toSet() == faces.toSet() } && faces.distinct().size == 3
            if (!ok) out.addAll(cells.toList())
        }
        for (cells in CubieCube.edgeFacelet) {
            val faces = cells.map { f[it] }
            val ok = CubieCube.edgeColor.any { it.toSet() == faces.toSet() } && faces.distinct().size == 2
            if (!ok) out.addAll(cells.toList())
        }
        return out
    }
}
