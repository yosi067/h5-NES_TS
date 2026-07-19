// ============================================================
// DSP-1B 數學協處理器模擬 (精確匹配 snes9x 參考實作)
// ============================================================
// 使用 DSP1ROM 查表確保位元精確匹配
// ============================================================

// DSP1ROM lookup table (from snes9x dsp1.cpp)
static DSP1ROM: [u16; 1024] = [
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0001, 0x0002, 0x0004, 0x0008, 0x0010, 0x0020, 0x0040,
    0x0080, 0x0100, 0x0200, 0x0400, 0x0800, 0x1000, 0x2000, 0x4000,
    0x7fff, 0x4000, 0x2000, 0x1000, 0x0800, 0x0400, 0x0200, 0x0100,
    0x0080, 0x0040, 0x0020, 0x0010, 0x0008, 0x0004, 0x0002, 0x0001,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x8000, 0xffe5, 0x0100, 0x7fff, 0x7f02, 0x7e08,
    0x7d12, 0x7c1f, 0x7b30, 0x7a45, 0x795d, 0x7878, 0x7797, 0x76ba,
    0x75df, 0x7507, 0x7433, 0x7361, 0x7293, 0x71c7, 0x70fe, 0x7038,
    0x6f75, 0x6eb4, 0x6df6, 0x6d3a, 0x6c81, 0x6bca, 0x6b16, 0x6a64,
    0x69b4, 0x6907, 0x685b, 0x67b2, 0x670b, 0x6666, 0x65c4, 0x6523,
    0x6484, 0x63e7, 0x634c, 0x62b3, 0x621c, 0x6186, 0x60f2, 0x6060,
    0x5fd0, 0x5f41, 0x5eb5, 0x5e29, 0x5d9f, 0x5d17, 0x5c91, 0x5c0c,
    0x5b88, 0x5b06, 0x5a85, 0x5a06, 0x5988, 0x590b, 0x5890, 0x5816,
    0x579d, 0x5726, 0x56b0, 0x563b, 0x55c8, 0x5555, 0x54e4, 0x5474,
    0x5405, 0x5398, 0x532b, 0x52bf, 0x5255, 0x51ec, 0x5183, 0x511c,
    0x50b6, 0x5050, 0x4fec, 0x4f89, 0x4f26, 0x4ec5, 0x4e64, 0x4e05,
    0x4da6, 0x4d48, 0x4cec, 0x4c90, 0x4c34, 0x4bda, 0x4b81, 0x4b28,
    0x4ad0, 0x4a79, 0x4a23, 0x49cd, 0x4979, 0x4925, 0x48d1, 0x487f,
    0x482d, 0x47dc, 0x478c, 0x473c, 0x46ed, 0x469f, 0x4651, 0x4604,
    0x45b8, 0x456c, 0x4521, 0x44d7, 0x448d, 0x4444, 0x43fc, 0x43b4,
    0x436d, 0x4326, 0x42e0, 0x429a, 0x4255, 0x4211, 0x41cd, 0x4189,
    0x4146, 0x4104, 0x40c2, 0x4081, 0x4040, 0x3fff, 0x41f7, 0x43e1,
    0x45bd, 0x478d, 0x4951, 0x4b0b, 0x4cbb, 0x4e61, 0x4fff, 0x5194,
    0x5322, 0x54a9, 0x5628, 0x57a2, 0x5914, 0x5a81, 0x5be9, 0x5d4a,
    0x5ea7, 0x5fff, 0x6152, 0x62a0, 0x63ea, 0x6530, 0x6672, 0x67b0,
    0x68ea, 0x6a20, 0x6b53, 0x6c83, 0x6daf, 0x6ed9, 0x6fff, 0x7122,
    0x7242, 0x735f, 0x747a, 0x7592, 0x76a7, 0x77ba, 0x78cb, 0x79d9,
    0x7ae5, 0x7bee, 0x7cf5, 0x7dfa, 0x7efe, 0x7fff, 0x0000, 0x0324,
    0x0647, 0x096a, 0x0c8b, 0x0fab, 0x12c8, 0x15e2, 0x18f8, 0x1c0b,
    0x1f19, 0x2223, 0x2528, 0x2826, 0x2b1f, 0x2e11, 0x30fb, 0x33de,
    0x36ba, 0x398c, 0x3c56, 0x3f17, 0x41ce, 0x447a, 0x471c, 0x49b4,
    0x4c3f, 0x4ebf, 0x5133, 0x539b, 0x55f5, 0x5842, 0x5a82, 0x5cb4,
    0x5ed7, 0x60ec, 0x62f2, 0x64e8, 0x66cf, 0x68a6, 0x6a6d, 0x6c24,
    0x6dca, 0x6f5f, 0x70e2, 0x7255, 0x73b5, 0x7504, 0x7641, 0x776c,
    0x7884, 0x798a, 0x7a7d, 0x7b5d, 0x7c29, 0x7ce3, 0x7d8a, 0x7e1d,
    0x7e9d, 0x7f09, 0x7f62, 0x7fa7, 0x7fd8, 0x7ff6, 0x7fff, 0x7ff6,
    0x7fd8, 0x7fa7, 0x7f62, 0x7f09, 0x7e9d, 0x7e1d, 0x7d8a, 0x7ce3,
    0x7c29, 0x7b5d, 0x7a7d, 0x798a, 0x7884, 0x776c, 0x7641, 0x7504,
    0x73b5, 0x7255, 0x70e2, 0x6f5f, 0x6dca, 0x6c24, 0x6a6d, 0x68a6,
    0x66cf, 0x64e8, 0x62f2, 0x60ec, 0x5ed7, 0x5cb4, 0x5a82, 0x5842,
    0x55f5, 0x539b, 0x5133, 0x4ebf, 0x4c3f, 0x49b4, 0x471c, 0x447a,
    0x41ce, 0x3f17, 0x3c56, 0x398c, 0x36ba, 0x33de, 0x30fb, 0x2e11,
    0x2b1f, 0x2826, 0x2528, 0x2223, 0x1f19, 0x1c0b, 0x18f8, 0x15e2,
    0x12c8, 0x0fab, 0x0c8b, 0x096a, 0x0647, 0x0324, 0x7fff, 0x7ff6,
    0x7fd8, 0x7fa7, 0x7f62, 0x7f09, 0x7e9d, 0x7e1d, 0x7d8a, 0x7ce3,
    0x7c29, 0x7b5d, 0x7a7d, 0x798a, 0x7884, 0x776c, 0x7641, 0x7504,
    0x73b5, 0x7255, 0x70e2, 0x6f5f, 0x6dca, 0x6c24, 0x6a6d, 0x68a6,
    0x66cf, 0x64e8, 0x62f2, 0x60ec, 0x5ed7, 0x5cb4, 0x5a82, 0x5842,
    0x55f5, 0x539b, 0x5133, 0x4ebf, 0x4c3f, 0x49b4, 0x471c, 0x447a,
    0x41ce, 0x3f17, 0x3c56, 0x398c, 0x36ba, 0x33de, 0x30fb, 0x2e11,
    0x2b1f, 0x2826, 0x2528, 0x2223, 0x1f19, 0x1c0b, 0x18f8, 0x15e2,
    0x12c8, 0x0fab, 0x0c8b, 0x096a, 0x0647, 0x0324, 0x0000, 0xfcdc,
    0xf9b9, 0xf696, 0xf375, 0xf055, 0xed38, 0xea1e, 0xe708, 0xe3f5,
    0xe0e7, 0xdddd, 0xdad8, 0xd7da, 0xd4e1, 0xd1ef, 0xcf05, 0xcc22,
    0xc946, 0xc674, 0xc3aa, 0xc0e9, 0xbe32, 0xbb86, 0xb8e4, 0xb64c,
    0xb3c1, 0xb141, 0xaecd, 0xac65, 0xaa0b, 0xa7be, 0xa57e, 0xa34c,
    0xa129, 0x9f14, 0x9d0e, 0x9b18, 0x9931, 0x975a, 0x9593, 0x93dc,
    0x9236, 0x90a1, 0x8f1e, 0x8dab, 0x8c4b, 0x8afc, 0x89bf, 0x8894,
    0x877c, 0x8676, 0x8583, 0x84a3, 0x83d7, 0x831d, 0x8276, 0x81e3,
    0x8163, 0x80f7, 0x809e, 0x8059, 0x8028, 0x800a, 0x6488, 0x0080,
    0x03ff, 0x0116, 0x0002, 0x0080, 0x4000, 0x3fd7, 0x3faf, 0x3f86,
    0x3f5d, 0x3f34, 0x3f0c, 0x3ee3, 0x3eba, 0x3e91, 0x3e68, 0x3e40,
    0x3e17, 0x3dee, 0x3dc5, 0x3d9c, 0x3d74, 0x3d4b, 0x3d22, 0x3cf9,
    0x3cd0, 0x3ca7, 0x3c7f, 0x3c56, 0x3c2d, 0x3c04, 0x3bdb, 0x3bb2,
    0x3b89, 0x3b60, 0x3b37, 0x3b0e, 0x3ae5, 0x3abc, 0x3a93, 0x3a69,
    0x3a40, 0x3a17, 0x39ee, 0x39c5, 0x399c, 0x3972, 0x3949, 0x3920,
    0x38f6, 0x38cd, 0x38a4, 0x387a, 0x3851, 0x3827, 0x37fe, 0x37d4,
    0x37aa, 0x3781, 0x3757, 0x372d, 0x3704, 0x36da, 0x36b0, 0x3686,
    0x365c, 0x3632, 0x3609, 0x35df, 0x35b4, 0x358a, 0x3560, 0x3536,
    0x350c, 0x34e1, 0x34b7, 0x348d, 0x3462, 0x3438, 0x340d, 0x33e3,
    0x33b8, 0x338d, 0x3363, 0x3338, 0x330d, 0x32e2, 0x32b7, 0x328c,
    0x3261, 0x3236, 0x320b, 0x31df, 0x31b4, 0x3188, 0x315d, 0x3131,
    0x3106, 0x30da, 0x30ae, 0x3083, 0x3057, 0x302b, 0x2fff, 0x2fd2,
    0x2fa6, 0x2f7a, 0x2f4d, 0x2f21, 0x2ef4, 0x2ec8, 0x2e9b, 0x2e6e,
    0x2e41, 0x2e14, 0x2de7, 0x2dba, 0x2d8d, 0x2d60, 0x2d32, 0x2d05,
    0x2cd7, 0x2ca9, 0x2c7b, 0x2c4d, 0x2c1f, 0x2bf1, 0x2bc3, 0x2b94,
    0x2b66, 0x2b37, 0x2b09, 0x2ada, 0x2aab, 0x2a7c, 0x2a4c, 0x2a1d,
    0x29ed, 0x29be, 0x298e, 0x295e, 0x292e, 0x28fe, 0x28ce, 0x289d,
    0x286d, 0x283c, 0x280b, 0x27da, 0x27a9, 0x2777, 0x2746, 0x2714,
    0x26e2, 0x26b0, 0x267e, 0x264c, 0x2619, 0x25e7, 0x25b4, 0x2581,
    0x254d, 0x251a, 0x24e6, 0x24b2, 0x247e, 0x244a, 0x2415, 0x23e1,
    0x23ac, 0x2376, 0x2341, 0x230b, 0x22d6, 0x229f, 0x2269, 0x2232,
    0x21fc, 0x21c4, 0x218d, 0x2155, 0x211d, 0x20e5, 0x20ad, 0x2074,
    0x203b, 0x2001, 0x1fc7, 0x1f8d, 0x1f53, 0x1f18, 0x1edd, 0x1ea1,
    0x1e66, 0x1e29, 0x1ded, 0x1db0, 0x1d72, 0x1d35, 0x1cf6, 0x1cb8,
    0x1c79, 0x1c39, 0x1bf9, 0x1bb8, 0x1b77, 0x1b36, 0x1af4, 0x1ab1,
    0x1a6e, 0x1a2a, 0x19e6, 0x19a1, 0x195c, 0x1915, 0x18ce, 0x1887,
    0x183f, 0x17f5, 0x17ac, 0x1761, 0x1715, 0x16c9, 0x167c, 0x162e,
    0x15df, 0x158e, 0x153d, 0x14eb, 0x1497, 0x1442, 0x13ec, 0x1395,
    0x133c, 0x12e2, 0x1286, 0x1228, 0x11c9, 0x1167, 0x1104, 0x109e,
    0x1036, 0x0fcc, 0x0f5f, 0x0eef, 0x0e7b, 0x0e04, 0x0d89, 0x0d0a,
    0x0c86, 0x0bfd, 0x0b6d, 0x0ad6, 0x0a36, 0x098d, 0x08d7, 0x0811,
    0x0736, 0x063e, 0x0519, 0x039a, 0x0000, 0x7fff, 0x0100, 0x0080,
    0x021d, 0x00c8, 0x00ce, 0x0048, 0x0a26, 0x277a, 0x00ce, 0x6488,
    0x14ac, 0x0001, 0x00f9, 0x00fc, 0x00ff, 0x00fc, 0x00f9, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
    0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff,
];

static DSP1_MUL_TABLE: [i16; 256] = [
    0x0000, 0x0003, 0x0006, 0x0009, 0x000c, 0x000f, 0x0012, 0x0015,
    0x0019, 0x001c, 0x001f, 0x0022, 0x0025, 0x0028, 0x002b, 0x002f,
    0x0032, 0x0035, 0x0038, 0x003b, 0x003e, 0x0041, 0x0045, 0x0048,
    0x004b, 0x004e, 0x0051, 0x0054, 0x0057, 0x005b, 0x005e, 0x0061,
    0x0064, 0x0067, 0x006a, 0x006d, 0x0071, 0x0074, 0x0077, 0x007a,
    0x007d, 0x0080, 0x0083, 0x0087, 0x008a, 0x008d, 0x0090, 0x0093,
    0x0096, 0x0099, 0x009d, 0x00a0, 0x00a3, 0x00a6, 0x00a9, 0x00ac,
    0x00af, 0x00b3, 0x00b6, 0x00b9, 0x00bc, 0x00bf, 0x00c2, 0x00c5,
    0x00c9, 0x00cc, 0x00cf, 0x00d2, 0x00d5, 0x00d8, 0x00db, 0x00df,
    0x00e2, 0x00e5, 0x00e8, 0x00eb, 0x00ee, 0x00f1, 0x00f5, 0x00f8,
    0x00fb, 0x00fe, 0x0101, 0x0104, 0x0107, 0x010b, 0x010e, 0x0111,
    0x0114, 0x0117, 0x011a, 0x011d, 0x0121, 0x0124, 0x0127, 0x012a,
    0x012d, 0x0130, 0x0133, 0x0137, 0x013a, 0x013d, 0x0140, 0x0143,
    0x0146, 0x0149, 0x014d, 0x0150, 0x0153, 0x0156, 0x0159, 0x015c,
    0x015f, 0x0163, 0x0166, 0x0169, 0x016c, 0x016f, 0x0172, 0x0175,
    0x0178, 0x017c, 0x017f, 0x0182, 0x0185, 0x0188, 0x018b, 0x018e,
    0x0192, 0x0195, 0x0198, 0x019b, 0x019e, 0x01a1, 0x01a4, 0x01a8,
    0x01ab, 0x01ae, 0x01b1, 0x01b4, 0x01b7, 0x01ba, 0x01be, 0x01c1,
    0x01c4, 0x01c7, 0x01ca, 0x01cd, 0x01d0, 0x01d4, 0x01d7, 0x01da,
    0x01dd, 0x01e0, 0x01e3, 0x01e6, 0x01ea, 0x01ed, 0x01f0, 0x01f3,
    0x01f6, 0x01f9, 0x01fc, 0x0200, 0x0203, 0x0206, 0x0209, 0x020c,
    0x020f, 0x0212, 0x0216, 0x0219, 0x021c, 0x021f, 0x0222, 0x0225,
    0x0228, 0x022c, 0x022f, 0x0232, 0x0235, 0x0238, 0x023b, 0x023e,
    0x0242, 0x0245, 0x0248, 0x024b, 0x024e, 0x0251, 0x0254, 0x0258,
    0x025b, 0x025e, 0x0261, 0x0264, 0x0267, 0x026a, 0x026e, 0x0271,
    0x0274, 0x0277, 0x027a, 0x027d, 0x0280, 0x0284, 0x0287, 0x028a,
    0x028d, 0x0290, 0x0293, 0x0296, 0x029a, 0x029d, 0x02a0, 0x02a3,
    0x02a6, 0x02a9, 0x02ac, 0x02b0, 0x02b3, 0x02b6, 0x02b9, 0x02bc,
    0x02bf, 0x02c2, 0x02c6, 0x02c9, 0x02cc, 0x02cf, 0x02d2, 0x02d5,
    0x02d8, 0x02db, 0x02df, 0x02e2, 0x02e5, 0x02e8, 0x02eb, 0x02ee,
    0x02f1, 0x02f5, 0x02f8, 0x02fb, 0x02fe, 0x0301, 0x0304, 0x0307,
    0x030b, 0x030e, 0x0311, 0x0314, 0x0317, 0x031a, 0x031d, 0x0321,
];

static DSP1_SIN_TABLE: [i16; 256] = [
     0x0000,  0x0324,  0x0647,  0x096a,  0x0c8b,  0x0fab,  0x12c8,  0x15e2,
     0x18f8,  0x1c0b,  0x1f19,  0x2223,  0x2528,  0x2826,  0x2b1f,  0x2e11,
     0x30fb,  0x33de,  0x36ba,  0x398c,  0x3c56,  0x3f17,  0x41ce,  0x447a,
     0x471c,  0x49b4,  0x4c3f,  0x4ebf,  0x5133,  0x539b,  0x55f5,  0x5842,
     0x5a82,  0x5cb4,  0x5ed7,  0x60ec,  0x62f2,  0x64e8,  0x66cf,  0x68a6,
     0x6a6d,  0x6c24,  0x6dca,  0x6f5f,  0x70e2,  0x7255,  0x73b5,  0x7504,
     0x7641,  0x776c,  0x7884,  0x798a,  0x7a7d,  0x7b5d,  0x7c29,  0x7ce3,
     0x7d8a,  0x7e1d,  0x7e9d,  0x7f09,  0x7f62,  0x7fa7,  0x7fd8,  0x7ff6,
     0x7fff,  0x7ff6,  0x7fd8,  0x7fa7,  0x7f62,  0x7f09,  0x7e9d,  0x7e1d,
     0x7d8a,  0x7ce3,  0x7c29,  0x7b5d,  0x7a7d,  0x798a,  0x7884,  0x776c,
     0x7641,  0x7504,  0x73b5,  0x7255,  0x70e2,  0x6f5f,  0x6dca,  0x6c24,
     0x6a6d,  0x68a6,  0x66cf,  0x64e8,  0x62f2,  0x60ec,  0x5ed7,  0x5cb4,
     0x5a82,  0x5842,  0x55f5,  0x539b,  0x5133,  0x4ebf,  0x4c3f,  0x49b4,
     0x471c,  0x447a,  0x41ce,  0x3f17,  0x3c56,  0x398c,  0x36ba,  0x33de,
     0x30fb,  0x2e11,  0x2b1f,  0x2826,  0x2528,  0x2223,  0x1f19,  0x1c0b,
     0x18f8,  0x15e2,  0x12c8,  0x0fab,  0x0c8b,  0x096a,  0x0647,  0x0324,
    -0x0000, -0x0324, -0x0647, -0x096a, -0x0c8b, -0x0fab, -0x12c8, -0x15e2,
    -0x18f8, -0x1c0b, -0x1f19, -0x2223, -0x2528, -0x2826, -0x2b1f, -0x2e11,
    -0x30fb, -0x33de, -0x36ba, -0x398c, -0x3c56, -0x3f17, -0x41ce, -0x447a,
    -0x471c, -0x49b4, -0x4c3f, -0x4ebf, -0x5133, -0x539b, -0x55f5, -0x5842,
    -0x5a82, -0x5cb4, -0x5ed7, -0x60ec, -0x62f2, -0x64e8, -0x66cf, -0x68a6,
    -0x6a6d, -0x6c24, -0x6dca, -0x6f5f, -0x70e2, -0x7255, -0x73b5, -0x7504,
    -0x7641, -0x776c, -0x7884, -0x798a, -0x7a7d, -0x7b5d, -0x7c29, -0x7ce3,
    -0x7d8a, -0x7e1d, -0x7e9d, -0x7f09, -0x7f62, -0x7fa7, -0x7fd8, -0x7ff6,
    -0x7fff, -0x7ff6, -0x7fd8, -0x7fa7, -0x7f62, -0x7f09, -0x7e9d, -0x7e1d,
    -0x7d8a, -0x7ce3, -0x7c29, -0x7b5d, -0x7a7d, -0x798a, -0x7884, -0x776c,
    -0x7641, -0x7504, -0x73b5, -0x7255, -0x70e2, -0x6f5f, -0x6dca, -0x6c24,
    -0x6a6d, -0x68a6, -0x66cf, -0x64e8, -0x62f2, -0x60ec, -0x5ed7, -0x5cb4,
    -0x5a82, -0x5842, -0x55f5, -0x539b, -0x5133, -0x4ebf, -0x4c3f, -0x49b4,
    -0x471c, -0x447a, -0x41ce, -0x3f17, -0x3c56, -0x398c, -0x36ba, -0x33de,
    -0x30fb, -0x2e11, -0x2b1f, -0x2826, -0x2528, -0x2223, -0x1f19, -0x1c0b,
    -0x18f8, -0x15e2, -0x12c8, -0x0fab, -0x0c8b, -0x096a, -0x0647, -0x0324,
];

// MaxAZS_Exp table (from snes9x DSP1_Parameter)
static MAX_AZS_EXP: [i16; 16] = [
    0x38b4, 0x38b7, 0x38ba, 0x38be, 0x38c0, 0x38c4, 0x38c7, 0x38ca,
    0x38ce, 0x38d0, 0x38d4, 0x38d7, 0x38da, 0x38dd, 0x38e0, 0x38e4,
];

// Sin/Cos matching snes9x (table lookup with linear interpolation)
#[inline]
fn dsp_sin(angle: i16) -> i16 {
    if angle < 0 {
        if angle == -32768 { return 0; }
        return -dsp_sin(-angle);
    }
    let s = DSP1_SIN_TABLE[(angle >> 8) as usize & 0xFF] as i32
        + (DSP1_MUL_TABLE[(angle & 0xFF) as usize] as i32
           * DSP1_SIN_TABLE[((0x40 + (angle >> 8)) as usize) & 0xFF] as i32 >> 15);
    if s > 32767 { 32767 } else { s as i16 }
}

#[inline]
fn dsp_cos(angle: i16) -> i16 {
    let a = if angle < 0 {
        if angle == -32768 { return -32768i16; }
        -angle
    } else {
        angle
    };
    let s = DSP1_SIN_TABLE[((0x40 + (a >> 8)) as usize) & 0xFF] as i32
        - (DSP1_MUL_TABLE[(a & 0xFF) as usize] as i32
           * DSP1_SIN_TABLE[((a >> 8) as usize) & 0xFF] as i32 >> 15);
    if s < -32768 { -32767 } else { s as i16 }
}

/// 固定小數點乘法: (a * b) >> 15
#[inline]
fn fmul(a: i16, b: i16) -> i16 {
    ((a as i32 * b as i32) >> 15) as i16
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    Idle,
    Params,
    Output,
}

/// DSP-1B 協處理器
pub struct Dsp1 {
    pub present: bool,

    phase: Phase,
    pub cmd: u8,

    // I/O 緩衝區
    params: [i16; 16],
    output: [i16; 16],
    n_params: usize,
    n_output: usize,
    p_idx: usize,
    o_idx: usize,

    // 位元組層級 I/O
    wr_lo: u8,
    wr_half: bool,
    rd_hi: u8,
    rd_half: bool,

    // $0A Raster 自動遞增計數器
    raster_vs: i16,

    // === 內部數學狀態 (matching snes9x) ===

    // 3 組方位矩陣 (group 0=A, 1=B, 2=C)
    matrices: [[[i16; 3]; 3]; 3],

    // $02 Parameter 命令設定的投影內部狀態
    sin_aas: i16,
    cos_aas: i16,
    sin_azs: i16,
    cos_azs: i16,
    cos_azs_clipped: i16,
    nx: i16,
    ny: i16,
    nz: i16,
    centre_x: i16,
    centre_y: i16,
    gx: i16,
    gy: i16,
    gz: i16,
    c_les: i16,
    e_les: i16,
    g_les: i16,
    vplane_c: i16,
    vplane_e: i16,
    voffset: i16,
    sec_azs_c1: i16,
    sec_azs_e1: i16,
    sec_azs_c2: i16,
    sec_azs_e2: i16,
}

impl Dsp1 {
    pub fn new() -> Self {
        Dsp1 {
            present: false,
            phase: Phase::Idle,
            cmd: 0,
            params: [0; 16],
            output: [0; 16],
            n_params: 0,
            n_output: 0,
            p_idx: 0,
            o_idx: 0,
            wr_lo: 0,
            wr_half: false,
            rd_hi: 0,
            rd_half: false,
            raster_vs: 0,
            matrices: [[[0; 3]; 3]; 3],
            sin_aas: 0, cos_aas: 0,
            sin_azs: 0, cos_azs: 0,
            cos_azs_clipped: 0,
            nx: 0, ny: 0, nz: 0,
            centre_x: 0, centre_y: 0,
            gx: 0, gy: 0, gz: 0,
            c_les: 0, e_les: 0, g_les: 0,
            vplane_c: 0, vplane_e: 0,
            voffset: 0,
            sec_azs_c1: 0, sec_azs_e1: 0,
            sec_azs_c2: 0, sec_azs_e2: 0,
        }
    }

    pub fn reset(&mut self) {
        let p = self.present;
        *self = Dsp1::new();
        self.present = p;
    }

    pub fn phase_name(&self) -> &'static str {
        match self.phase {
            Phase::Idle => "Idle",
            Phase::Params => "Params",
            Phase::Output => "Output",
        }
    }

    // ================================================================
    // Bus I/O
    // ================================================================

    pub fn read_sr(&self) -> u8 {
        if self.phase == Phase::Output {
            0xC0 // RQM=1, DRS=1 — CPU should read DR
        } else {
            0x80 // RQM=1, DRS=0 — CPU should write DR
        }
    }

    pub fn read_dr(&mut self) -> u8 {
        if self.phase != Phase::Output {
            return 0x00;
        }

        if !self.rd_half {
            let w = if self.o_idx < self.n_output {
                self.output[self.o_idx] as u16
            } else {
                0x0000
            };
            self.rd_hi = (w >> 8) as u8;
            self.rd_half = true;
            let val = w as u8;
            val
        } else {
            let hi = self.rd_hi;
            self.rd_half = false;
            self.o_idx += 1;
            if self.o_idx >= self.n_output {
                // $0A/$1A: auto-repeat — re-execute and produce next scanline
                if self.cmd == 0x0A || self.cmd == 0x1A
                    || self.cmd == 0x2A || self.cmd == 0x3A
                {
                    self.op_raster();
                    self.o_idx = 0;
                    self.rd_half = false;
                } else {
                    self.phase = Phase::Idle;
                }
            }
            hi
        }
    }

    pub fn write_dr(&mut self, val: u8) {
        // Raster output is auto-repeating when read, but writes only discard the
        // pending output bytes. SMK uses eight dummy writes before its next command.
        if self.phase == Phase::Output {
            if matches!(self.cmd, 0x0A | 0x1A | 0x2A | 0x3A) {
                if self.rd_half {
                    self.rd_half = false;
                    self.o_idx += 1;
                } else {
                    self.rd_half = true;
                }

                if self.o_idx >= self.n_output && !self.rd_half {
                    self.phase = Phase::Idle;
                    self.o_idx = 0;
                    self.n_output = 0;
                }
                return;
            }

            self.phase = Phase::Idle;
            self.wr_half = false;
            self.rd_half = false;
            self.o_idx = 0;
            self.n_output = 0;
        }

        match self.phase {
            Phase::Idle => {
                // DSP-1 command is a SINGLE byte; only lower 6 bits matter (mirrors at $40/$80/$C0)
                self.cmd = val & 0x3F;
                let (ni, no) = Self::cmd_io(self.cmd);
                self.n_params = ni;
                self.n_output = no;
                self.p_idx = 0;
                self.o_idx = 0;
                self.wr_half = false;

                if ni > 0 {
                    self.phase = Phase::Params;
                } else {
                    self.execute();
                    if no > 0 {
                        self.phase = Phase::Output;
                        self.rd_half = false;
                    } else {
                        self.phase = Phase::Idle;
                    }
                }
            }
            Phase::Params => {
                if !self.wr_half {
                    self.wr_lo = val;
                    self.wr_half = true;
                } else {
                    let word = (self.wr_lo as u16) | ((val as u16) << 8);
                    self.wr_half = false;

                    if self.p_idx < 16 {
                        self.params[self.p_idx] = word as i16;
                        self.p_idx += 1;
                    }
                    if self.p_idx >= self.n_params {
                        self.execute();
                        if self.n_output > 0 {
                            self.phase = Phase::Output;
                            self.rd_half = false;
                        } else {
                            self.phase = Phase::Idle;
                        }
                    }
                }
            }
            Phase::Output => unreachable!(),
        }
    }

    // ================================================================
    // 命令 I/O 大小表 (匹配 snes9x)
    // ================================================================

    fn cmd_io(cmd: u8) -> (usize, usize) {
        match cmd {
            0x00 => (2, 1),         // Multiply
            0x20 => (2, 1),         // Multiply (variant)
            0x10 | 0x30 => (2, 2),  // Inverse
            0x04 | 0x24 => (2, 2),  // Trigonometric
            0x08 => (3, 2),         // Radius (output: Ll, Lh)
            0x18 => (4, 1),         // Range (X,Y,Z,R)
            0x28 => (3, 1),         // Distance
            0x38 => (4, 1),         // Range2
            0x0C | 0x2C => (3, 2),  // 2D Rotate
            0x1C | 0x3C => (6, 3),  // 3D Rotate (6 in, 3 out)
            0x02 | 0x12 | 0x22 | 0x32 => (7, 4), // Parameter
            0x0A => (1, 4),         // Raster (A,B,C,D)
            0x1A | 0x2A | 0x3A => (1, 4), // Raster variants
            0x06 | 0x16 | 0x26 | 0x36 => (3, 3), // Projection (H,V,M)
            0x0E | 0x1E | 0x2E | 0x3E => (2, 2), // Target (X,Y)
            0x01 | 0x05 | 0x31 | 0x35 => (4, 0), // Set Attitude A (m,Zr,Yr,Xr)
            0x11 | 0x15 => (4, 0),  // Set Attitude B
            0x21 | 0x25 => (4, 0),  // Set Attitude C
            0x03 | 0x33 => (3, 3),  // Subjective A
            0x13 => (3, 3),         // Subjective B
            0x23 => (3, 3),         // Subjective C
            0x0D | 0x09 | 0x39 | 0x3D => (3, 3), // Objective A
            0x19 | 0x1D => (3, 3),  // Objective B
            0x29 | 0x2D => (3, 3),  // Objective C
            0x0B | 0x3B => (3, 1),  // Scalar A
            0x1B => (3, 1),         // Scalar B
            0x2B => (3, 1),         // Scalar C
            0x14 | 0x34 => (6, 3),  // Gyrate
            0x0F | 0x07 => (1, 1),  // Memory Test
            0x1F | 0x17 | 0x37 | 0x3F => (1, 1), // Data ROM
            0x27 | 0x2F => (1, 1),  // Version
            _ => (0, 0),
        }
    }

    // ================================================================
    // 命令執行分發
    // ================================================================

    fn execute(&mut self) {
        match self.cmd {
            0x00 => self.op_multiply(false),
            0x20 => self.op_multiply(true),
            0x10 | 0x30 => self.op_inverse(),
            0x04 | 0x24 => self.op_triangle(),
            0x08 => self.op_radius(),
            0x18 => self.op_range(false),
            0x38 => self.op_range(true),
            0x28 => self.op_distance(),
            0x0C | 0x2C => self.op_rotate_2d(),
            0x1C | 0x3C => self.op_rotate_3d(),
            0x02 | 0x12 | 0x22 | 0x32 => {
                self.op_parameter();
            }
            0x0A | 0x1A | 0x2A | 0x3A => {
                self.raster_vs = self.params[0];
                self.op_raster();
            }
            0x06 | 0x16 | 0x26 | 0x36 => {
                self.op_projection();
            }
            0x0E | 0x1E | 0x2E | 0x3E => self.op_target_screen(),
            0x01 | 0x05 | 0x31 | 0x35 => self.op_set_attitude(0),
            0x11 | 0x15 => self.op_set_attitude(1),
            0x21 | 0x25 => self.op_set_attitude(2),
            0x03 | 0x33 => self.op_subjective(0),
            0x13 => self.op_subjective(1),
            0x23 => self.op_subjective(2),
            0x0D | 0x09 | 0x39 | 0x3D => self.op_objective(0),
            0x19 | 0x1D => self.op_objective(1),
            0x29 | 0x2D => self.op_objective(2),
            0x0B | 0x3B => self.op_scalar(0),
            0x1B => self.op_scalar(1),
            0x2B => self.op_scalar(2),
            0x14 | 0x34 => self.op_gyrate(),
            0x0F | 0x07 => { self.output[0] = 0x0000; }
            0x1F | 0x17 | 0x37 | 0x3F => { self.output[0] = 0x0100; }
            0x27 | 0x2F => { self.output[0] = 0x0100; }
            _ => {
                for i in 0..self.n_output { self.output[i] = 0; }
            }
        }
    }

    // ================================================================
    // 內部工具 (精確匹配 snes9x — 使用 DSP1ROM 查表)
    // ================================================================

    /// DSP1_Normalize: matching snes9x exactly
    fn normalize(m: i16, coefficient: &mut i16, exponent: &mut i16) {
        let mut e: i16 = 0;

        if m < 0 {
            let mut i: i16 = 0x4000;
            while (m & i) != 0 && i != 0 {
                i >>= 1;
                e += 1;
            }
        } else {
            let mut i: i16 = 0x4000;
            while (m & i) == 0 && i != 0 {
                i >>= 1;
                e += 1;
            }
        }

        if e > 0 {
            *coefficient = ((m as i32).wrapping_mul(DSP1ROM[0x21 + e as usize] as i16 as i32) << 1) as i16;
        } else {
            *coefficient = m;
        }

        *exponent -= e;
    }

    /// DSP1_NormalizeDouble: matching snes9x exactly
    fn normalize_double(product: i32, coefficient: &mut i16, exponent: &mut i16) {
        let n: i16 = (product & 0x7fff) as i16;
        let m: i16 = (product >> 15) as i16;
        let mut e: i16 = 0;

        if m < 0 {
            let mut i: i16 = 0x4000;
            while (m & i) != 0 && i != 0 {
                i >>= 1;
                e += 1;
            }
        } else {
            let mut i: i16 = 0x4000;
            while (m & i) == 0 && i != 0 {
                i >>= 1;
                e += 1;
            }
        }

        if e > 0 {
            *coefficient = ((m as i32).wrapping_mul(DSP1ROM[0x0021 + e as usize] as i16 as i32) << 1) as i16;

            if e < 15 {
                *coefficient = (*coefficient as i32
                    + (n as i32 * DSP1ROM[0x0040 - e as usize] as i16 as i32 >> 15)) as i16;
            } else {
                let mut e2: i16 = 0;
                if m < 0 {
                    let t = !(n | -32768_i16);
                    let mut i: i16 = 0x4000;
                    while (t & i) == 0 && i != 0 {
                        i >>= 1;
                        e2 += 1;
                    }
                } else {
                    let mut i: i16 = 0x4000;
                    while (n & i) == 0 && i != 0 {
                        i >>= 1;
                        e2 += 1;
                    }
                }

                if (e + e2) > 15 {
                    *coefficient = ((n as i32).wrapping_mul(DSP1ROM[0x0012 + (e + e2) as usize] as i16 as i32) << 1) as i16;
                } else {
                    *coefficient = (*coefficient).wrapping_add(n);
                }

                e += e2;
            }
        } else {
            *coefficient = m;
        }

        *exponent = e;
    }

    /// DSP1_Truncate: matching snes9x exactly
    fn truncate(c: i16, e: i16) -> i16 {
        if e > 0 {
            if c > 0 { return 32767; }
            else if c < 0 { return -32767; }
        } else if e < 0 {
            return (c as i32 * DSP1ROM[(0x0031i16 + e) as usize] as i16 as i32 >> 15) as i16;
        }
        c
    }

    /// DSP1_ShiftR: matching snes9x exactly
    #[inline]
    fn shift_r(c: i16, e: i16) -> i16 {
        (c as i32 * DSP1ROM[(0x0031i16 + e) as usize] as i16 as i32 >> 15) as i16
    }

    /// DSP1_Inverse: matching snes9x exactly (ROM table initial guess)
    fn dsp_inverse(coefficient: i16, exponent: i16, i_coeff: &mut i16, i_exp: &mut i16) {
        if coefficient == 0 {
            *i_coeff = 0x7FFF;
            *i_exp = 0x002F;
            return;
        }

        let sign: i32 = if coefficient < 0 { -1 } else { 1 };
        let mut c = if coefficient < 0 {
            if coefficient < -32767 { 32767i16 } else { -coefficient }
        } else {
            coefficient
        };

        let mut e = exponent;

        // Normalize
        while c < 0x4000 {
            c <<= 1;
            e -= 1;
        }

        if c == 0x4000 {
            if sign == 1 {
                *i_coeff = 0x7FFF;
            } else {
                *i_coeff = -0x4000;
                e -= 1;
            }
        } else {
            // Initial guess from ROM table
            let mut i_val = DSP1ROM[((c as u16 - 0x4000) >> 7) as usize + 0x0065] as i16 as i32;

            // Two Newton iterations
            i_val = (i_val + (-i_val * (c as i32 * i_val >> 15) >> 15)) << 1;
            i_val = (i_val + (-i_val * (c as i32 * i_val >> 15) >> 15)) << 1;

            *i_coeff = (i_val * sign) as i16;
        }

        *i_exp = 1 - e;
    }

    // ================================================================
    // 數學運算
    // ================================================================

    fn op_multiply(&mut self, round_up: bool) {
        let a = self.params[0] as i32;
        let b = self.params[1] as i32;
        let mut r = ((a * b) >> 15) as i16;
        if round_up { r = r.wrapping_add(1); }
        self.output[0] = r;
    }

    fn op_inverse(&mut self) {
        let mut ic: i16 = 0;
        let mut ie: i16 = 0;
        Self::dsp_inverse(self.params[0], self.params[1], &mut ic, &mut ie);
        self.output[0] = ic;
        self.output[1] = ie;
    }

    fn op_triangle(&mut self) {
        let angle = self.params[0];
        let radius = self.params[1];
        self.output[0] = fmul(dsp_sin(angle), radius);
        self.output[1] = fmul(dsp_cos(angle), radius);
    }

    /// $01/$11/$21: Set Attitude (4 params: m, Zr, Yr, Xr)
    fn op_set_attitude(&mut self, group: usize) {
        let mut m = self.params[0];
        let zr = self.params[1];
        let yr = self.params[2];
        let xr = self.params[3];

        let sin_az = dsp_sin(zr);
        let cos_az = dsp_cos(zr);
        let sin_ay = dsp_sin(yr);
        let cos_ay = dsp_cos(yr);
        let sin_ax = dsp_sin(xr);
        let cos_ax = dsp_cos(xr);

        m >>= 1;

        let mat = &mut self.matrices[group];
        mat[0][0] = fmul(fmul(m, cos_az), cos_ay);
        mat[0][1] = -fmul(fmul(m, sin_az), cos_ay);
        mat[0][2] = fmul(m, sin_ay);

        mat[1][0] = fmul(fmul(m, sin_az), cos_ax)
            .wrapping_add(fmul(fmul(fmul(m, cos_az), sin_ax), sin_ay));
        mat[1][1] = fmul(fmul(m, cos_az), cos_ax)
            .wrapping_sub(fmul(fmul(fmul(m, sin_az), sin_ax), sin_ay));
        mat[1][2] = -fmul(fmul(m, sin_ax), cos_ay);

        mat[2][0] = fmul(fmul(m, sin_az), sin_ax)
            .wrapping_sub(fmul(fmul(fmul(m, cos_az), cos_ax), sin_ay));
        mat[2][1] = fmul(fmul(m, cos_az), sin_ax)
            .wrapping_add(fmul(fmul(fmul(m, sin_az), cos_ax), sin_ay));
        mat[2][2] = fmul(fmul(m, cos_ax), cos_ay);
    }

    /// $02: Parameter (投影參數設定)
    /// Input: Fx, Fy, Fz, Lfe, Les, Aas, Azs
    /// Output: Vof, Vva, Cx, Cy
    fn op_parameter(&mut self) {
        let fx = self.params[0];
        let fy = self.params[1];
        let fz = self.params[2];
        let lfe = self.params[3];
        let les = self.params[4];
        let aas = self.params[5];
        let mut azs = self.params[6];

        self.sin_aas = dsp_sin(aas);
        self.cos_aas = dsp_cos(aas);
        self.sin_azs = dsp_sin(azs);
        self.cos_azs = dsp_cos(azs);

        self.nx = fmul(self.sin_azs, -self.sin_aas);
        self.ny = fmul(self.sin_azs, self.cos_aas);
        self.nz = fmul(self.cos_azs, 0x7FFF);

        let lfe_nx = fmul(lfe, self.nx);
        let lfe_ny = fmul(lfe, self.ny);
        let lfe_nz = fmul(lfe, self.nz);

        self.centre_x = fx.wrapping_add(lfe_nx);
        self.centre_y = fy.wrapping_add(lfe_ny);
        let centre_z = fz.wrapping_add(lfe_nz);

        let les_nx = fmul(les, self.nx);
        let les_ny = fmul(les, self.ny);
        let les_nz = fmul(les, self.nz);

        self.gx = self.centre_x.wrapping_sub(les_nx);
        self.gy = self.centre_y.wrapping_sub(les_ny);
        self.gz = centre_z.wrapping_sub(les_nz);

        self.e_les = 0;
        self.c_les = les;
        Self::normalize(les, &mut self.c_les, &mut self.e_les);
        self.g_les = les;

        let mut e: i16 = 0;
        let mut c = centre_z;
        Self::normalize(centre_z, &mut c, &mut e);
        self.vplane_c = c;
        self.vplane_e = e;

        // Clamp zenith angle using MaxAZS_Exp table
        let max_azs: i16 = MAX_AZS_EXP[(-e).max(0).min(15) as usize];

        if azs < 0 {
            let neg_max = -max_azs;
            if azs < neg_max.wrapping_add(1) {
                azs = neg_max.wrapping_add(1);
            }
        } else if azs > max_azs {
            azs = max_azs;
        }

        let sin_azs_clipped = dsp_sin(azs);
        self.cos_azs_clipped = dsp_cos(azs);

        Self::dsp_inverse(self.cos_azs_clipped, 0, &mut self.sec_azs_c1, &mut self.sec_azs_e1);

        // Adjust centre for clipped zenith
        let mut adj_c = c;
        let mut adj_e = e;
        let sec_prod = fmul(adj_c, self.sec_azs_c1);
        Self::normalize(sec_prod, &mut adj_c, &mut adj_e);
        adj_e += self.sec_azs_e1;

        let trunc = Self::truncate(adj_c, adj_e);
        let correction = fmul(trunc, sin_azs_clipped);

        self.centre_x = self.centre_x.wrapping_add(fmul(correction, self.sin_aas));
        self.centre_y = self.centre_y.wrapping_sub(fmul(correction, self.cos_aas));

        let mut vof: i16 = 0;

        if self.params[6] != azs || azs == max_azs {
            let orig = self.params[6];
            let diff = if orig == -32768_i16 { -32767 } else { orig };
            let mut cd = diff.wrapping_sub(max_azs);
            if cd >= 0 { cd = cd.wrapping_sub(1); }
            let aux = !(cd << 2);

            let f1 = (aux as i32 * DSP1ROM[0x0328] as i16 as i32 >> 15) as i16;
            let f2 = ((f1 as i32 * aux as i32 >> 15) as i16).wrapping_add(DSP1ROM[0x0327] as i16);
            vof = vof.wrapping_sub(((f2 as i32 * aux as i32 >> 15) as i32 * les as i32 >> 15) as i16);

            let c2 = (aux as i32 * aux as i32 >> 15) as i16;
            let aux2 = ((c2 as i32 * DSP1ROM[0x0324] as i16 as i32 >> 15) as i16).wrapping_add(DSP1ROM[0x0325] as i16);
            let cos_fix = ((c2 as i32 * aux2 as i32 >> 15) as i32 * self.cos_azs_clipped as i32 >> 15) as i16;
            self.cos_azs_clipped = self.cos_azs_clipped.wrapping_add(cos_fix);
        }

        self.voffset = fmul(les, self.cos_azs_clipped);

        // Compute Vva
        let mut csec: i16 = 0;
        let mut esec: i16 = 0;
        Self::dsp_inverse(sin_azs_clipped, 0, &mut csec, &mut esec);

        let mut voff_c = self.voffset;
        let mut voff_e = esec;
        Self::normalize(self.voffset, &mut voff_c, &mut voff_e);
        let mut norm_c = fmul(voff_c, csec);
        Self::normalize(norm_c, &mut norm_c, &mut voff_e);

        if norm_c == -32768_i16 {
            norm_c >>= 1;
            voff_e += 1;
        }

        let vva = Self::truncate(-norm_c, voff_e);

        Self::dsp_inverse(self.cos_azs_clipped, 0, &mut self.sec_azs_c2, &mut self.sec_azs_e2);

        self.output[0] = vof;
        self.output[1] = vva;
        self.output[2] = self.centre_x;
        self.output[3] = self.centre_y;
    }

    /// $0A: Raster — outputs Mode 7 matrix (An, Bn, Cn, Dn)
    fn op_raster(&mut self) {
        let vs = self.raster_vs;

        let inner = fmul(vs, self.sin_azs).wrapping_add(self.voffset);

        let mut c: i16 = 0;
        let mut e: i16 = 7;
        Self::dsp_inverse(inner, 7, &mut c, &mut e);
        e = e.wrapping_add(self.vplane_e);

        let c1 = fmul(c, self.vplane_c);
        let e1_base = e.wrapping_add(self.sec_azs_e2);

        // Horizontal scale: An, Cn
        let mut norm_c = c1;
        let mut e_h = e;
        Self::normalize(c1, &mut norm_c, &mut e_h);
        let trunc_h = Self::truncate(norm_c, e_h);

        let an = fmul(trunc_h, self.cos_aas);
        let cn = fmul(trunc_h, self.sin_aas);

        // Vertical scale: Bn, Dn (with secant of zenith)
        let sec_prod = fmul(c1, self.sec_azs_c2);
        let mut norm_v = sec_prod;
        let mut e_v = e1_base;
        Self::normalize(sec_prod, &mut norm_v, &mut e_v);
        let trunc_v = Self::truncate(norm_v, e_v);

        let bn = fmul(trunc_v, -self.sin_aas);
        let dn = fmul(trunc_v, self.cos_aas);

        self.output[0] = an;
        self.output[1] = bn;
        self.output[2] = cn;
        self.output[3] = dn;

        self.raster_vs = self.raster_vs.wrapping_add(1);
    }

    fn op_subjective(&mut self, group: usize) {
        let f = self.params[0];
        let l = self.params[1];
        let u = self.params[2];
        let m = &self.matrices[group];

        self.output[0] = fmul(f, m[0][0]).wrapping_add(fmul(l, m[1][0])).wrapping_add(fmul(u, m[2][0]));
        self.output[1] = fmul(f, m[0][1]).wrapping_add(fmul(l, m[1][1])).wrapping_add(fmul(u, m[2][1]));
        self.output[2] = fmul(f, m[0][2]).wrapping_add(fmul(l, m[1][2])).wrapping_add(fmul(u, m[2][2]));
    }

    fn op_objective(&mut self, group: usize) {
        let x = self.params[0];
        let y = self.params[1];
        let z = self.params[2];
        let m = &self.matrices[group];

        self.output[0] = fmul(x, m[0][0]).wrapping_add(fmul(y, m[0][1])).wrapping_add(fmul(z, m[0][2]));
        self.output[1] = fmul(x, m[1][0]).wrapping_add(fmul(y, m[1][1])).wrapping_add(fmul(z, m[1][2]));
        self.output[2] = fmul(x, m[2][0]).wrapping_add(fmul(y, m[2][1])).wrapping_add(fmul(z, m[2][2]));
    }

    fn op_scalar(&mut self, group: usize) {
        let x = self.params[0] as i32;
        let y = self.params[1] as i32;
        let z = self.params[2] as i32;
        let m = &self.matrices[group];

        self.output[0] = ((x * m[0][0] as i32 + y * m[0][1] as i32 + z * m[0][2] as i32) >> 15) as i16;
    }

    fn op_projection(&mut self) {
        let x = self.params[0];
        let y = self.params[1];
        let z = self.params[2];

        let mut px: i16 = 0;
        let mut py: i16 = 0;
        let mut pz: i16 = 0;
        let mut e4: i16 = 0;
        let mut ey: i16 = 0;
        let mut e3: i16 = 0;

        Self::normalize_double((x as i32).wrapping_sub(self.gx as i32), &mut px, &mut e4);
        Self::normalize_double((y as i32).wrapping_sub(self.gy as i32), &mut py, &mut ey);
        Self::normalize_double((z as i32).wrapping_sub(self.gz as i32), &mut pz, &mut e3);

        px >>= 1; e4 -= 1;
        py >>= 1; ey -= 1;
        pz >>= 1; e3 -= 1;

        let mut ref_e = ey.min(e3).min(e4);

        px = Self::shift_r(px, e4 - ref_e);
        py = Self::shift_r(py, ey - ref_e);
        pz = Self::shift_r(pz, e3 - ref_e);

        let c11 = -fmul(px, self.nx);
        let c8 = -fmul(py, self.ny);
        let c9 = -fmul(pz, self.nz);
        let c12 = c11.wrapping_add(c8).wrapping_add(c9);

        let mut aux4 = c12 as i32;
        // snes9x overwrites refE here: refE = 16 - refE
        ref_e = 16 - ref_e;
        if ref_e >= 0 { aux4 <<= ref_e; }
        else { aux4 >>= -ref_e; }
        if aux4 == -1 { aux4 = 0; }
        aux4 >>= 1;

        let aux = (self.g_les as u16 as i32).wrapping_add(aux4);
        let mut c10: i16 = 0;
        let mut e2: i16 = 0;
        Self::normalize_double(aux, &mut c10, &mut e2);
        e2 = 15 - e2;

        let mut c4: i16 = 0;
        let mut e4b: i16 = 0;
        Self::dsp_inverse(c10, 0, &mut c4, &mut e4b);
        let c2 = fmul(c4, self.c_les);

        // H
        let c16 = fmul(px, fmul(self.cos_aas, 0x7FFF));
        let c20 = fmul(py, fmul(self.sin_aas, 0x7FFF));
        let c17 = c16.wrapping_add(c20);
        let c18 = fmul(c17, c2);
        let mut c19 = c18;
        let mut e7: i16 = 0;
        Self::normalize(c18, &mut c19, &mut e7);
        self.output[0] = Self::truncate(c19, self.e_les - e2 + ref_e + e7);

        // V
        let c21 = fmul(px, fmul(self.cos_azs, -self.sin_aas));
        let c22 = fmul(py, fmul(self.cos_azs, self.cos_aas));
        let c23 = fmul(pz, fmul(-self.sin_azs, 0x7FFF));
        let c24 = c21.wrapping_add(c22).wrapping_add(c23);
        let c26 = fmul(c24, c2);
        let mut c25 = c26;
        let mut e6: i16 = 0;
        Self::normalize(c26, &mut c25, &mut e6);
        self.output[1] = Self::truncate(c25, self.e_les - e2 + ref_e + e6);

        // M
        let mut c6 = c2;
        Self::normalize(c2, &mut c6, &mut e4b);
        self.output[2] = Self::truncate(c6, e4b + self.e_les - e2 - 7);
    }

    fn op_target_screen(&mut self) {
        let mut h = self.params[0];
        let v = self.params[1];

        let inner = fmul(v, self.sin_azs).wrapping_add(self.voffset);
        let mut c: i16 = 0;
        let mut e: i16 = 8;
        Self::dsp_inverse(inner, 8, &mut c, &mut e);
        e = e.wrapping_add(self.vplane_e);

        let c1 = fmul(c, self.vplane_c);
        let mut e1 = e.wrapping_add(self.sec_azs_e1);

        h <<= 8;

        let mut norm_c = c1;
        Self::normalize(c1, &mut norm_c, &mut e);
        let h_trunc = fmul(Self::truncate(norm_c, e), h);

        let mut x = self.centre_x.wrapping_add(fmul(h_trunc, self.cos_aas));
        let mut y = self.centre_y.wrapping_sub(fmul(h_trunc, self.sin_aas));

        let v_shifted = v << 8;
        let sec_prod = fmul(c1, self.sec_azs_c1);
        Self::normalize(sec_prod, &mut norm_c, &mut e1);
        let v_trunc = fmul(Self::truncate(norm_c, e1), v_shifted);

        x = x.wrapping_add(fmul(v_trunc, -self.sin_aas));
        y = y.wrapping_add(fmul(v_trunc, self.cos_aas));

        self.output[0] = x;
        self.output[1] = y;
    }

    fn op_radius(&mut self) {
        let x = self.params[0] as i32;
        let y = self.params[1] as i32;
        let z = self.params[2] as i32;
        let size = (x * x + y * y + z * z) << 1;
        self.output[0] = (size & 0xFFFF) as i16;
        self.output[1] = ((size >> 16) & 0xFFFF) as i16;
    }

    fn op_range(&mut self, inc: bool) {
        let x = self.params[0] as i32;
        let y = self.params[1] as i32;
        let z = self.params[2] as i32;
        let r = self.params[3] as i32;
        let mut d = ((x * x + y * y + z * z - r * r) >> 15) as i16;
        if inc { d = d.wrapping_add(1); }
        self.output[0] = d;
    }

    fn op_distance(&mut self) {
        let x = self.params[0] as i32;
        let y = self.params[1] as i32;
        let z = self.params[2] as i32;
        let radius = x * x + y * y + z * z;

        if radius == 0 {
            self.output[0] = 0;
            return;
        }

        let mut c: i16 = 0;
        let mut e: i16 = 0;
        Self::normalize_double(radius, &mut c, &mut e);
        if e & 1 != 0 {
            c = (c as i32 * 0x4000 >> 15) as i16;
        }

        let pos = (c as i32 * 0x0040 >> 15) as usize;
        let node1 = DSP1ROM[0x00d5 + pos] as i16;
        let node2 = DSP1ROM[0x00d6 + pos] as i16;

        let mut result = (((node2 as i32 - node1 as i32) * (c as i32 & 0x1ff) >> 9) as i16).wrapping_add(node1);
        result >>= e >> 1;

        self.output[0] = result;
    }

    fn op_rotate_2d(&mut self) {
        let angle = self.params[0];
        let x1 = self.params[1];
        let y1 = self.params[2];

        let sin_a = dsp_sin(angle);
        let cos_a = dsp_cos(angle);

        // snes9x: X2 = Y1*Sin + X1*Cos, Y2 = Y1*Cos - X1*Sin
        self.output[0] = fmul(y1, sin_a).wrapping_add(fmul(x1, cos_a));
        self.output[1] = fmul(y1, cos_a).wrapping_sub(fmul(x1, sin_a));
    }

    fn op_rotate_3d(&mut self) {
        let z_angle = self.params[0];
        let y_angle = self.params[1];
        let x_angle = self.params[2];
        let mut xbr = self.params[3];
        let mut ybr = self.params[4];
        let mut zbr = self.params[5];

        let sin_z = dsp_sin(z_angle);
        let cos_z = dsp_cos(z_angle);
        let sin_y = dsp_sin(y_angle);
        let cos_y = dsp_cos(y_angle);
        let sin_x = dsp_sin(x_angle);
        let cos_x = dsp_cos(x_angle);

        // Rotate around Z
        let x1 = fmul(ybr, sin_z).wrapping_add(fmul(xbr, cos_z));
        let y1 = fmul(ybr, cos_z).wrapping_sub(fmul(xbr, sin_z));
        xbr = x1;
        ybr = y1;

        // Rotate around Y
        let z1 = fmul(xbr, sin_y).wrapping_add(fmul(zbr, cos_y));
        let x1 = fmul(xbr, cos_y).wrapping_sub(fmul(zbr, sin_y));
        xbr = x1;
        zbr = z1;

        // Rotate around X
        let y1 = fmul(zbr, sin_x).wrapping_add(fmul(ybr, cos_x));
        let z1 = fmul(zbr, cos_x).wrapping_sub(fmul(ybr, sin_x));

        self.output[0] = xbr;
        self.output[1] = y1;
        self.output[2] = z1;
    }

    fn op_gyrate(&mut self) {
        let zr = self.params[0];
        let xr = self.params[1];
        let yr = self.params[2];
        let u = self.params[3];
        let f = self.params[4];
        let l = self.params[5];

        let cos_x = dsp_cos(xr);
        let sin_y = dsp_sin(yr);
        let cos_y = dsp_cos(yr);

        let mut csec: i16 = 0;
        let mut esec: i16 = 0;
        Self::dsp_inverse(cos_x, 0, &mut csec, &mut esec);

        // Rotation around Z
        let prod = (u as i32 * cos_y as i32).wrapping_sub(f as i32 * sin_y as i32);
        let mut c: i16 = 0;
        let mut e: i16 = 0;
        Self::normalize_double(prod, &mut c, &mut e);
        e = esec - e;
        Self::normalize(fmul(c, csec), &mut c, &mut e);
        let zrr = zr.wrapping_add(Self::truncate(c, e));

        // Rotation around X
        let xrr = xr.wrapping_add(fmul(u, sin_y)).wrapping_add(fmul(f, cos_y));

        // Rotation around Y
        let prod2 = (u as i32 * cos_y as i32).wrapping_add(f as i32 * sin_y as i32);
        let mut c2: i16 = 0;
        let mut e2: i16 = 0;
        Self::normalize_double(prod2, &mut c2, &mut e2);
        e2 = esec - e2;
        let sin_x = dsp_sin(xr);
        let mut sin_x_n: i16 = sin_x;
        Self::normalize(sin_x, &mut sin_x_n, &mut e2);
        let ctan = fmul(csec, sin_x_n);
        let mut c3 = -fmul(c2, ctan);
        Self::normalize(c3, &mut c3, &mut e2);
        let yrr = yr.wrapping_add(Self::truncate(c3, e2)).wrapping_add(l);

        self.output[0] = zrr;
        self.output[1] = xrr;
        self.output[2] = yrr;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn begin_raster_output(dsp1: &mut Dsp1) {
        dsp1.write_dr(0x0A);
        dsp1.write_dr(0x00);
        dsp1.write_dr(0x00);
        assert_eq!(dsp1.phase_name(), "Output");
    }

    #[test]
    fn raster_dummy_writes_drain_output_without_repeating() {
        let mut dsp1 = Dsp1::new();
        begin_raster_output(&mut dsp1);

        for _ in 0..7 {
            dsp1.write_dr(0x00);
            assert_eq!(dsp1.phase_name(), "Output");
        }
        dsp1.write_dr(0x00);
        assert_eq!(dsp1.phase_name(), "Idle");

        dsp1.write_dr(0x00);
        assert_eq!(dsp1.phase_name(), "Params");
        assert_eq!(dsp1.cmd, 0x00);
    }

    #[test]
    fn raster_writes_continue_from_a_partially_read_word() {
        let mut dsp1 = Dsp1::new();
        begin_raster_output(&mut dsp1);

        dsp1.read_dr();
        for _ in 0..6 {
            dsp1.write_dr(0x00);
            assert_eq!(dsp1.phase_name(), "Output");
        }
        dsp1.write_dr(0x00);

        assert_eq!(dsp1.phase_name(), "Idle");
    }
}
