package app.rubikbe

/** Thứ tự mặt dùng chung trong toàn app: U R F D L B (trên, phải, trước, dưới, trái, sau). */
object Faces {
    const val U = 0
    const val R = 1
    const val F = 2
    const val D = 3
    const val L = 4
    const val B = 5
}

/**
 * Khối Rubik ở mức "miếng": vị trí và hướng của 8 góc, 12 cạnh.
 * Góc: URF UFL ULB UBR DFR DLF DBL DRB. Cạnh: UR UF UL UB DR DF DL DB FR FL BL BR.
 * cp[i] = góc đang nằm ở vị trí i; co[i] = độ xoay của nó (0..2). Tương tự với cạnh.
 */
class CubieCube(
    val cp: IntArray = IntArray(8) { it },
    val co: IntArray = IntArray(8),
    val ep: IntArray = IntArray(12) { it },
    val eo: IntArray = IntArray(12)
) {
    fun multiply(b: CubieCube): CubieCube {
        val r = CubieCube(IntArray(8), IntArray(8), IntArray(12), IntArray(12))
        for (i in 0 until 8) {
            r.cp[i] = cp[b.cp[i]]
            r.co[i] = (co[b.cp[i]] + b.co[i]) % 3
        }
        for (i in 0 until 12) {
            r.ep[i] = ep[b.ep[i]]
            r.eo[i] = (eo[b.ep[i]] + b.eo[i]) % 2
        }
        return r
    }

    fun move(m: Int): CubieCube = multiply(Moves.cubes[m])

    fun apply(list: IntArray): CubieCube {
        var c = this
        for (m in list) c = c.move(m)
        return c
    }

    fun isSolved(): Boolean {
        for (i in 0 until 8) if (cp[i] != i || co[i] != 0) return false
        for (i in 0 until 12) if (ep[i] != i || eo[i] != 0) return false
        return true
    }

    /** Khoá ngắn gọn để so trùng trạng thái khi tìm kiếm. */
    fun key(): String {
        val chars = CharArray(20)
        for (i in 0 until 8) chars[i] = 'A' + cp[i] * 3 + co[i]
        for (i in 0 until 12) chars[8 + i] = 'A' + ep[i] * 2 + eo[i]
        return String(chars)
    }

    // ----- Toạ độ cho bộ giải hai pha -----

    fun twist(): Int {
        var t = 0
        for (i in 0 until 7) t = t * 3 + co[i]
        return t
    }

    fun flip(): Int {
        var f = 0
        for (i in 0 until 11) f = f * 2 + eo[i]
        return f
    }

    /** Tập vị trí của 4 cạnh tầng giữa (FR FL BL BR); khối đã giải cho giá trị 494. */
    fun slice(): Int {
        var idx = 0
        var k = 0
        for (j in 0 until 12) if (ep[j] >= 8) {
            k++
            idx += binom(j, k)
        }
        return idx
    }

    fun cornerPerm(): Int = rank(cp, 0, 8)

    /** Chỉ có nghĩa khi 8 cạnh tầng trên/dưới đang nằm ở tầng trên/dưới (pha 2). */
    fun udEdgePerm(): Int = rank(ep, 0, 8)

    fun slicePerm(): Int = rank(ep, 8, 4)

    /** Đổi sang 54 ô; giá trị mỗi ô là mặt (0..5) mà màu của nó thuộc về. */
    fun toFacelets(): IntArray {
        val f = IntArray(54)
        for (face in 0 until 6) f[face * 9 + 4] = face
        for (i in 0 until 8) {
            val j = cp[i]
            val ori = co[i]
            for (n in 0 until 3) f[cornerFacelet[i][(n + ori) % 3]] = cornerColor[j][n]
        }
        for (i in 0 until 12) {
            val j = ep[i]
            val ori = eo[i]
            for (n in 0 until 2) f[edgeFacelet[i][(n + ori) % 2]] = edgeColor[j][n]
        }
        return f
    }

    companion object {
        const val OK = 0
        const val ERR_PIECE = 1   // có miếng mang tổ hợp màu không tồn tại
        const val ERR_DUP = 2     // hai miếng giống hệt nhau
        const val ERR_TWIST = 3   // một góc bị xoay lệch
        const val ERR_FLIP = 4    // một cạnh bị lật
        const val ERR_PARITY = 5  // hai miếng bị đổi chỗ

        val cornerFacelet = arrayOf(
            intArrayOf(8, 9, 20), intArrayOf(6, 18, 38), intArrayOf(0, 36, 47), intArrayOf(2, 45, 11),
            intArrayOf(29, 26, 15), intArrayOf(27, 44, 24), intArrayOf(33, 53, 42), intArrayOf(35, 17, 51)
        )
        val edgeFacelet = arrayOf(
            intArrayOf(5, 10), intArrayOf(7, 19), intArrayOf(3, 37), intArrayOf(1, 46),
            intArrayOf(32, 16), intArrayOf(28, 25), intArrayOf(30, 43), intArrayOf(34, 52),
            intArrayOf(23, 12), intArrayOf(21, 41), intArrayOf(50, 39), intArrayOf(48, 14)
        )
        val cornerColor = arrayOf(
            intArrayOf(Faces.U, Faces.R, Faces.F), intArrayOf(Faces.U, Faces.F, Faces.L),
            intArrayOf(Faces.U, Faces.L, Faces.B), intArrayOf(Faces.U, Faces.B, Faces.R),
            intArrayOf(Faces.D, Faces.F, Faces.R), intArrayOf(Faces.D, Faces.L, Faces.F),
            intArrayOf(Faces.D, Faces.B, Faces.L), intArrayOf(Faces.D, Faces.R, Faces.B)
        )
        val edgeColor = arrayOf(
            intArrayOf(Faces.U, Faces.R), intArrayOf(Faces.U, Faces.F), intArrayOf(Faces.U, Faces.L),
            intArrayOf(Faces.U, Faces.B), intArrayOf(Faces.D, Faces.R), intArrayOf(Faces.D, Faces.F),
            intArrayOf(Faces.D, Faces.L), intArrayOf(Faces.D, Faces.B), intArrayOf(Faces.F, Faces.R),
            intArrayOf(Faces.F, Faces.L), intArrayOf(Faces.B, Faces.L), intArrayOf(Faces.B, Faces.R)
        )

        fun binom(n: Int, k: Int): Int {
            if (k < 0 || k > n) return 0
            var r = 1L
            for (i in 0 until k) r = r * (n - i) / (i + 1)
            return r.toInt()
        }

        private fun rank(a: IntArray, off: Int, n: Int): Int {
            var r = 0
            for (i in 0 until n) {
                var smaller = 0
                for (j in i + 1 until n) if (a[off + j] < a[off + i]) smaller++
                r = r * (n - i) + smaller
            }
            return r
        }

        private fun parity(a: IntArray): Int {
            var p = 0
            for (i in a.indices) for (j in i + 1 until a.size) if (a[j] < a[i]) p++
            return p % 2
        }

        /** Đọc 54 ô (giá trị là mặt 0..5). Trả về khối và mã lỗi. */
        fun fromFacelets(f: IntArray): Pair<CubieCube?, Int> {
            val c = CubieCube(IntArray(8), IntArray(8), IntArray(12), IntArray(12))
            for (i in 0 until 8) {
                var ori = -1
                for (o in 0 until 3) {
                    val v = f[cornerFacelet[i][o]]
                    if (v == Faces.U || v == Faces.D) {
                        ori = o
                        break
                    }
                }
                if (ori < 0) return null to ERR_PIECE
                val col1 = f[cornerFacelet[i][(ori + 1) % 3]]
                val col2 = f[cornerFacelet[i][(ori + 2) % 3]]
                val j = (0 until 8).firstOrNull { cornerColor[it][1] == col1 && cornerColor[it][2] == col2 }
                    ?: return null to ERR_PIECE
                c.cp[i] = j
                c.co[i] = ori % 3
            }
            for (i in 0 until 12) {
                val a = f[edgeFacelet[i][0]]
                val b = f[edgeFacelet[i][1]]
                var found = false
                for (j in 0 until 12) {
                    if (edgeColor[j][0] == a && edgeColor[j][1] == b) {
                        c.ep[i] = j; c.eo[i] = 0; found = true; break
                    }
                    if (edgeColor[j][0] == b && edgeColor[j][1] == a) {
                        c.ep[i] = j; c.eo[i] = 1; found = true; break
                    }
                }
                if (!found) return null to ERR_PIECE
            }
            if (c.cp.distinct().size != 8 || c.ep.distinct().size != 12) return null to ERR_DUP
            if (c.co.sum() % 3 != 0) return null to ERR_TWIST
            if (c.eo.sum() % 2 != 0) return null to ERR_FLIP
            if (parity(c.cp) != parity(c.ep)) return null to ERR_PARITY
            return c to OK
        }
    }
}

/** 18 bước xoay: chỉ số = mặt * 3 + (0: xuôi chiều kim đồng hồ, 1: hai lần, 2: ngược chiều). */
object Moves {
    private val basic = arrayOf(
        CubieCube(intArrayOf(3, 0, 1, 2, 4, 5, 6, 7), IntArray(8),
            intArrayOf(3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11), IntArray(12)),
        CubieCube(intArrayOf(4, 1, 2, 0, 7, 5, 6, 3), intArrayOf(2, 0, 0, 1, 1, 0, 0, 2),
            intArrayOf(8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0), IntArray(12)),
        CubieCube(intArrayOf(1, 5, 2, 3, 0, 4, 6, 7), intArrayOf(1, 2, 0, 0, 2, 1, 0, 0),
            intArrayOf(0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11), intArrayOf(0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0)),
        CubieCube(intArrayOf(0, 1, 2, 3, 5, 6, 7, 4), IntArray(8),
            intArrayOf(0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11), IntArray(12)),
        CubieCube(intArrayOf(0, 2, 6, 3, 4, 1, 5, 7), intArrayOf(0, 1, 2, 0, 0, 2, 1, 0),
            intArrayOf(0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11), IntArray(12)),
        CubieCube(intArrayOf(0, 1, 3, 7, 4, 5, 2, 6), intArrayOf(0, 0, 1, 2, 0, 0, 2, 1),
            intArrayOf(0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7), intArrayOf(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1))
    )

    val cubes: Array<CubieCube> = Array(18) { m ->
        var c = basic[m / 3]
        repeat(m % 3) { c = c.multiply(basic[m / 3]) }
        c
    }

    private const val LETTERS = "URFDLB"
    private val SIDES = intArrayOf(Faces.F, Faces.R, Faces.B, Faces.L)

    fun name(m: Int): String = LETTERS[m / 3] + when (m % 3) {
        0 -> ""
        1 -> "2"
        else -> "'"
    }

    fun text(list: IntArray): String = list.joinToString(" ") { name(it) }

    fun inverse(m: Int): Int = m / 3 * 3 + 2 - m % 3

    /**
     * Đọc công thức như "R U R' U'". [frame] xoay góc nhìn quanh trục dọc:
     * 0 = mặt trước là F, 1 = mặt trước là R, 2 = B, 3 = L.
     */
    fun parse(text: String, frame: Int = 0): IntArray =
        text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.map { tok ->
            var face = LETTERS.indexOf(tok[0])
            require(face >= 0) { "Bước xoay lạ: $tok" }
            val side = SIDES.indexOf(face)
            if (side >= 0) face = SIDES[(side + frame) % 4]
            val power = when {
                tok.endsWith("2") -> 1
                tok.endsWith("'") -> 2
                else -> 0
            }
            face * 3 + power
        }.toIntArray()

    /** Dãy xáo ngẫu nhiên: không xoay cùng một mặt hai lần liền. */
    fun scramble(rnd: java.util.Random, n: Int): IntArray {
        val out = IntArray(n)
        var last = -1
        var beforeLast = -1
        for (i in 0 until n) {
            var face: Int
            do {
                face = rnd.nextInt(6)
            } while (face == last || (face == beforeLast && face % 3 == last % 3))
            beforeLast = last
            last = face
            out[i] = face * 3 + rnd.nextInt(3)
        }
        return out
    }
}

/**
 * Vị trí 3D của 54 ô dán màu, dùng để vẽ khối và để xoay ô theo bước xoay.
 * Trục: x sang phải (mặt R), y lên trên (mặt U), z hướng về người xem (mặt F).
 */
object Geometry {
    val pos = Array(54) { IntArray(3) }
    val normal = Array(54) { IntArray(3) }
    val axis = arrayOf(
        intArrayOf(0, 1, 0), intArrayOf(1, 0, 0), intArrayOf(0, 0, 1),
        intArrayOf(0, -1, 0), intArrayOf(-1, 0, 0), intArrayOf(0, 0, -1)
    )

    /** dest[m][i] = ô i chạy tới ô nào sau bước xoay m. */
    val dest = Array(18) { IntArray(54) }

    fun axisIndex(face: Int): Int = when (face) {
        Faces.U, Faces.D -> 1
        Faces.R, Faces.L -> 0
        else -> 2
    }

    init {
        for (f in 0 until 6) for (r in 0 until 3) for (c in 0 until 3) {
            val i = f * 9 + r * 3 + c
            pos[i] = when (f) {
                Faces.U -> intArrayOf(c - 1, 1, r - 1)
                Faces.R -> intArrayOf(1, 1 - r, 1 - c)
                Faces.F -> intArrayOf(c - 1, 1 - r, 1)
                Faces.D -> intArrayOf(c - 1, -1, 1 - r)
                Faces.L -> intArrayOf(-1, 1 - r, c - 1)
                else -> intArrayOf(1 - c, 1 - r, -1)
            }
            normal[i] = axis[f].copyOf()
        }
        for (m in 0 until 18) {
            val f = m / 3
            val turns = m % 3 + 1
            val k = axisIndex(f)
            val s = axis[f][k]
            // Xuôi chiều kim đồng hồ nhìn từ ngoài mặt = quay -90° quanh trục hướng ra ngoài.
            val q = ((-s * turns) % 4 + 4) % 4
            for (i in 0 until 54) {
                if (pos[i][k] * s != 1) {
                    dest[m][i] = i
                    continue
                }
                dest[m][i] = index(rotate(pos[i], k, q), rotate(normal[i], k, q))
            }
        }
    }

    /** Quay vector nguyên [q] lần 90° ngược chiều kim đồng hồ quanh trục toạ độ [k]. */
    fun rotate(v: IntArray, k: Int, q: Int): IntArray {
        var x = v[0]
        var y = v[1]
        var z = v[2]
        repeat(q) {
            when (k) {
                0 -> { val ny = -z; z = y; y = ny }
                1 -> { val nx = z; z = -x; x = nx }
                else -> { val nx = -y; y = x; x = nx }
            }
        }
        return intArrayOf(x, y, z)
    }

    fun index(p: IntArray, n: IntArray): Int {
        for (i in 0 until 54) {
            if (pos[i][0] == p[0] && pos[i][1] == p[1] && pos[i][2] == p[2] &&
                normal[i][0] == n[0] && normal[i][1] == n[1] && normal[i][2] == n[2]
            ) return i
        }
        return -1
    }

    fun apply(colors: IntArray, m: Int): IntArray {
        val r = IntArray(54)
        for (i in 0 until 54) r[dest[m][i]] = colors[i]
        return r
    }
}
