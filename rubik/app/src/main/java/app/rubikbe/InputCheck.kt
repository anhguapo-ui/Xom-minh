package app.rubikbe

/**
 * Kiểm tra màu bé đã tô. Khi có lỗi, đoán luôn ô nào có thể bị tô nhầm
 * (thử đổi màu một ô, hoặc đổi chỗ hai ô) để khoanh đỏ cho bé sửa.
 */
object InputCheck {
    class Result(val cube: CubieCube?, val message: String?, val suspects: Set<Int>)

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
        if (over.isNotEmpty()) {
            val parts = over.map { "${names[it].lowercase()} thừa ${count[it] - 9} ô" } +
                under.map { "${names[it].lowercase()} thiếu ${9 - count[it]} ô" }
            var message = "Mỗi màu phải có đúng 9 ô. Đang có: ${parts.joinToString(", ")}."
            // Thử đổi một ô thừa màu sang màu đang thiếu.
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

        val f = faces(colors)!!
        val (cube, err) = CubieCube.fromFacelets(f)
        if (err == CubieCube.OK) return Result(cube, null, emptySet())

        // Số ô mỗi màu đã đúng: lỗi thường do tô đổi chỗ hai ô. Thử đổi chỗ từng cặp.
        val suspects = HashSet<Int>()
        val trial = colors.copyOf()
        for (i in 0 until 54) {
            if (i % 9 == 4) continue
            for (j in i + 1 until 54) {
                if (j % 9 == 4 || colors[i] == colors[j]) continue
                trial[i] = colors[j]
                trial[j] = colors[i]
                if (valid(trial)) {
                    suspects.add(i)
                    suspects.add(j)
                }
                trial[i] = colors[i]
                trial[j] = colors[j]
            }
        }
        if (suspects.isNotEmpty() && suspects.size <= 6) {
            return Result(null, "Hình như có hai ô bị tô đổi chỗ cho nhau. Con xem lại các ô có viền đỏ nhé.", suspects)
        }
        val badPieces = impossiblePieces(f)
        val message = when (err) {
            CubieCube.ERR_PIECE, CubieCube.ERR_DUP ->
                "Có miếng mang màu không thể có trên khối Rubik thật. Con xem lại các ô có viền đỏ nhé."
            CubieCube.ERR_TWIST -> "Có một góc bị xoay lệch. Nếu đã tô đúng hết thì có thể khối bị cạy ra và lắp lại sai."
            CubieCube.ERR_FLIP -> "Có một cạnh bị lật ngược. Nếu đã tô đúng hết thì có thể khối bị cạy ra và lắp lại sai."
            else -> "Có hai miếng bị đổi chỗ cho nhau. Nếu đã tô đúng hết thì có thể khối bị cạy ra và lắp lại sai."
        }
        return Result(null, message, badPieces)
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
