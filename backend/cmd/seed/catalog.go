package main

// Static demo catalogue: fictional suppliers, customers and staff; common Indonesian pharmacy products.

type unitDef struct {
	name  string
	conv  int
	price int64 // selling price incl. PPN
}

type productDef struct {
	name, generic string
	category      int // index into categoryNames
	class         string
	shelf         string
	minStock      int
	track         bool
	units         []unitDef // first = base unit
	cost          int64     // purchase cost per base unit
	supplier      int       // index into supplierDefs
	weight        int       // how often it sells
	initial       int       // base units bought on day 0
	restock       bool      // reordered when low
	expiredBatch  int       // >0: day-0 batch of this many base units that expires a few days before today
	nearExpiry    bool      // day-0 batch expires within the warning window
}

var categoryNames = []string{
	"Analgesik & Antipiretik", "Antibiotik", "Obat Batuk & Flu", "Vitamin & Suplemen", "Obat Lambung", "Obat Kulit",
	"Obat Mata & Telinga", "Antihipertensi", "Antidiabetes", "Obat Anak", "Alat Kesehatan", "Jasa & Layanan",
}

var supplierDefs = []struct {
	name, contact, phone, address, npwp string
	term                                int
}{
	{"PT Sinar Farma Distribusi", "Hendra", "0274-512301", "Jl. Magelang KM 6, Sleman", "01.111.222.3-541.000", 30},
	{"PT Mitra Sehat Abadi", "Lina", "0274-512302", "Jl. Kaliurang KM 5, Sleman", "01.111.222.4-541.000", 30},
	{"PT Cahaya Medika Nusantara", "Fajar", "0274-512303", "Jl. Solo KM 8, Sleman", "01.111.222.5-541.000", 45},
	{"PT Sumber Husada Raya", "Yuni", "0274-512304", "Jl. Godean KM 4, Sleman", "01.111.222.6-541.000", 14},
	{"PT Prima Pharma Lestari", "Bayu", "0274-512305", "Jl. Wates KM 3, Bantul", "01.111.222.7-541.000", 30},
	{"CV Bintang Medika", "Eka", "0274-512306", "Jl. Parangtritis KM 2, Bantul", "", 7},
	{"PT Global Apotek Supply", "Rizal", "0274-512307", "Jl. Ring Road Utara 12, Sleman", "01.111.222.8-541.000", 30},
	{"PT Mega Distribusi Farmasi", "Nia", "0274-512308", "Jl. Gejayan 21, Sleman", "01.111.222.9-541.000", 60},
	{"PT Karya Medika Utama", "Toni", "0274-512309", "Jl. Monjali 40, Sleman", "01.111.223.0-541.000", 30},
	{"PT Nusa Indah Farma", "Desi", "0274-512310", "Jl. Palagan 88, Sleman", "01.111.223.1-541.000", 21},
}

var productDefs = []productDef{
	{"Paracetamol 500 mg", "Paracetamol 500 mg", 0, "bebas", "A-01", 50, true, []unitDef{{"tablet", 1, 500}, {"strip", 10, 4500}, {"box", 100, 42000}}, 300, 0, 20, 600, true, 0, false},
	{"Panadol 500 mg", "Paracetamol 500 mg", 0, "bebas", "A-01", 30, true, []unitDef{{"kaplet", 1, 1300}, {"strip", 10, 12500}}, 950, 1, 10, 300, true, 0, false},
	{"Sanmol Sirup 60 ml", "Paracetamol 120 mg/5 ml", 9, "bebas", "A-02", 5, true, []unitDef{{"botol", 1, 22000}}, 16000, 1, 6, 30, true, 0, true},
	{"Ibuprofen 400 mg", "Ibuprofen 400 mg", 0, "bebas_terbatas", "A-02", 30, true, []unitDef{{"tablet", 1, 800}, {"strip", 10, 7500}, {"box", 100, 70000}}, 450, 0, 8, 300, true, 0, false},
	{"Asam Mefenamat 500 mg", "Mefenamic acid 500 mg", 0, "keras", "A-03", 30, true, []unitDef{{"tablet", 1, 700}, {"strip", 10, 6500}}, 400, 2, 7, 300, true, 0, false},
	{"Amoxicillin 500 mg", "Amoxicillin 500 mg", 1, "keras", "B-01", 50, true, []unitDef{{"kapsul", 1, 1000}, {"strip", 10, 9500}, {"box", 100, 90000}}, 600, 2, 12, 500, true, 0, false},
	{"Cefadroxil 500 mg", "Cefadroxil 500 mg", 1, "keras", "B-01", 30, true, []unitDef{{"kapsul", 1, 2500}, {"strip", 10, 24000}}, 1600, 2, 5, 200, true, 0, false},
	{"Ciprofloxacin 500 mg", "Ciprofloxacin 500 mg", 1, "keras", "B-02", 20, true, []unitDef{{"tablet", 1, 1800}, {"strip", 10, 17000}}, 1100, 4, 4, 150, true, 0, false},
	{"Azithromycin 500 mg", "Azithromycin 500 mg", 1, "keras", "B-02", 9, true, []unitDef{{"tablet", 1, 9000}, {"strip", 3, 26000}}, 6000, 4, 3, 12, false, 0, false},
	{"OBH Combi 100 ml", "Succus liquiritiae, ammonium chloride", 2, "bebas_terbatas", "C-01", 8, true, []unitDef{{"botol", 1, 18500}}, 13500, 3, 8, 40, true, 0, false},
	{"Woods Peppermint 60 ml", "Dextromethorphan, diphenhydramine", 2, "bebas_terbatas", "C-01", 5, true, []unitDef{{"botol", 1, 21000}}, 15500, 3, 3, 20, true, 6, false},
	{"Decolgen", "Paracetamol, phenylpropanolamine, chlorpheniramine", 2, "bebas_terbatas", "C-02", 20, true, []unitDef{{"tablet", 1, 600}, {"strip", 4, 2300}}, 450, 3, 9, 200, true, 0, false},
	{"Neozep Forte", "Paracetamol, phenylephrine, chlorpheniramine", 2, "bebas_terbatas", "C-02", 20, true, []unitDef{{"tablet", 1, 700}, {"strip", 4, 2600}}, 500, 3, 7, 200, true, 0, false},
	{"Vitamin C 500 mg", "Ascorbic acid 500 mg", 3, "bebas", "D-01", 40, true, []unitDef{{"tablet", 1, 300}, {"strip", 10, 2800}}, 180, 5, 10, 400, true, 0, true},
	{"Becom-Z", "Vitamin B kompleks, vitamin C, zinc", 3, "bebas", "D-01", 20, true, []unitDef{{"kaplet", 1, 3500}, {"strip", 10, 33000}}, 2500, 5, 4, 150, true, 0, false},
	{"Enervon-C", "Multivitamin", 3, "bebas", "D-02", 20, true, []unitDef{{"tablet", 1, 1300}, {"strip", 4, 5000}}, 900, 5, 5, 200, true, 0, false},
	{"Sangobion", "Ferrous gluconate, vitamin", 3, "bebas", "D-02", 20, true, []unitDef{{"kapsul", 1, 2100}, {"strip", 10, 20000}}, 1500, 6, 3, 150, true, 0, false},
	{"Promag", "Hydrotalcite, magnesium hydroxide", 4, "bebas", "E-01", 24, true, []unitDef{{"tablet", 1, 900}, {"strip", 12, 10000}}, 650, 6, 9, 300, true, 0, false},
	{"Antasida Doen", "Aluminium hydroxide, magnesium hydroxide", 4, "bebas", "E-01", 30, true, []unitDef{{"tablet", 1, 250}, {"strip", 10, 2200}}, 150, 6, 6, 300, true, 0, false},
	{"Omeprazole 20 mg", "Omeprazole 20 mg", 4, "keras", "E-02", 20, true, []unitDef{{"kapsul", 1, 1200}, {"strip", 10, 11000}}, 700, 7, 6, 250, true, 0, false},
	{"Lansoprazole 30 mg", "Lansoprazole 30 mg", 4, "keras", "E-02", 20, true, []unitDef{{"kapsul", 1, 2500}, {"strip", 10, 23000}}, 1600, 7, 3, 150, true, 0, false},
	{"Hydrocortisone Krim 2,5%", "Hydrocortisone acetate 2,5%", 5, "keras", "F-01", 3, true, []unitDef{{"tube", 1, 9000}}, 6000, 7, 2, 15, true, 8, false},
	{"Betadine Antiseptik 30 ml", "Povidone iodine 10%", 5, "bebas", "F-01", 4, true, []unitDef{{"botol", 1, 26000}}, 19000, 8, 3, 25, true, 0, false},
	{"Kalpanax Krim", "Miconazole nitrate 2%", 5, "bebas_terbatas", "F-02", 6, true, []unitDef{{"tube", 1, 12000}}, 8500, 8, 2, 8, false, 0, false},
	{"Insto Regular 7,5 ml", "Tetrahydrozoline HCl", 6, "bebas_terbatas", "G-01", 4, true, []unitDef{{"botol", 1, 17000}}, 12500, 8, 3, 20, true, 5, false},
	{"Amlodipine 5 mg", "Amlodipine besylate 5 mg", 7, "keras", "H-01", 60, true, []unitDef{{"tablet", 1, 600}, {"strip", 10, 5500}, {"box", 100, 52000}}, 300, 9, 8, 500, true, 0, false},
	{"Captopril 25 mg", "Captopril 25 mg", 7, "keras", "H-01", 40, true, []unitDef{{"tablet", 1, 350}, {"strip", 10, 3200}}, 180, 9, 5, 300, true, 0, true},
	{"Metformin 500 mg", "Metformin HCl 500 mg", 8, "keras", "H-02", 60, true, []unitDef{{"tablet", 1, 400}, {"strip", 10, 3800}, {"box", 100, 36000}}, 220, 9, 7, 500, true, 0, false},
	{"Glimepiride 2 mg", "Glimepiride 2 mg", 8, "keras", "H-02", 20, true, []unitDef{{"tablet", 1, 1500}, {"strip", 10, 14000}}, 900, 0, 3, 150, true, 0, false},
	{"Tempra Drops 15 ml", "Paracetamol 100 mg/ml", 9, "bebas", "I-01", 3, true, []unitDef{{"botol", 1, 52000}}, 40000, 0, 2, 15, true, 0, false},
	{"Zinc Sirup Anak 60 ml", "Zinc sulfate 20 mg/5 ml", 9, "bebas_terbatas", "I-01", 3, true, []unitDef{{"botol", 1, 35000}}, 25000, 1, 2, 15, true, 0, false},
	{"Codeine 10 mg", "Codeine phosphate 10 mg", 0, "narkotika", "K-01", 10, true, []unitDef{{"tablet", 1, 2500}, {"strip", 10, 24000}}, 1500, 2, 1, 60, true, 0, false},
	{"Alprazolam 0,5 mg", "Alprazolam 0,5 mg", 0, "psikotropika", "K-01", 10, true, []unitDef{{"tablet", 1, 3000}, {"strip", 10, 28000}}, 1800, 2, 1, 60, true, 0, false},
	{"Diazepam 2 mg", "Diazepam 2 mg", 0, "psikotropika", "K-01", 10, true, []unitDef{{"tablet", 1, 1000}, {"strip", 10, 9000}}, 500, 2, 1, 60, true, 0, false},
	{"Masker Medis 3 Ply", "", 10, "non_obat", "J-01", 50, true, []unitDef{{"pcs", 1, 1000}, {"box", 50, 40000}}, 600, 4, 6, 500, true, 0, false},
	{"Termometer Digital", "", 10, "non_obat", "J-01", 5, true, []unitDef{{"pcs", 1, 35000}}, 24000, 4, 1, 7, false, 0, false},
	{"Kasa Steril 16x16", "", 10, "non_obat", "J-02", 10, true, []unitDef{{"pak", 1, 8000}}, 5500, 4, 3, 40, true, 0, false},
	{"Embalase", "", 11, "non_obat", "", 0, false, []unitDef{{"kali", 1, 2000}}, 0, 0, 4, 0, false, 0, false},
	{"Jasa Racik Puyer", "", 11, "non_obat", "", 0, false, []unitDef{{"bungkus", 1, 3000}}, 0, 0, 2, 0, false, 0, false},
	{"Cek Tekanan Darah", "", 11, "non_obat", "", 0, false, []unitDef{{"kali", 1, 10000}}, 0, 0, 2, 0, false, 0, false},
}

var customerDefs = []struct{ name, phone, email, address string }{
	{"Budi Santoso", "081227001001", "budi.santoso@example.com", "Jl. Kaliurang KM 10, Ngaglik"},
	{"Sri Rahayu", "081227001002", "", "Perum Jongkang Baru B-12, Ngaglik"},
	{"Hartono Wibowo", "081227001003", "", "Jl. Besi Jangkang KM 1, Ngemplak"},
	{"Ani Susanti", "081227001004", "ani.s@example.com", "Sardonoharjo RT 03/RW 12, Ngaglik"},
	{"Joko Prasetyo", "081227001005", "", "Jl. Palagan Tentara Pelajar 50, Ngaglik"},
	{"Wahyuni", "081227001006", "", "Minomartani Blok C-7, Ngaglik"},
	{"Slamet Riyadi", "081227001007", "", "Sukoharjo RT 01, Ngaglik"},
	{"Lestari Ningsih", "081227001008", "lestari.n@example.com", "Jl. Kaliurang KM 12, Pakem"},
	{"Bambang Sutrisno", "081227001009", "", "Donoharjo RT 05, Ngaglik"},
	{"Endang Purwati", "081227001010", "", "Perum Griya Taman Asri D-3, Sleman"},
	{"Yusuf Hidayat", "081227001011", "", "Jl. Turi KM 4, Turi"},
	{"Rini Astuti", "081227001012", "rini.astuti@example.com", "Sinduharjo RT 08, Ngaglik"},
	{"Teguh Santoso", "081227001013", "", "Jl. Magelang KM 9, Mlati"},
	{"Nurul Hidayah", "081227001014", "", "Condongcatur Blok F-21, Depok"},
	{"Agung Nugroho", "081227001015", "", "Wedomartani RT 02, Ngemplak"},
	{"Kartini Dewi", "", "", "Sariharjo RT 06, Ngaglik"},
	{"Paijo", "081227001017", "", "Widodomartani, Ngemplak"},
	{"dr. Hendra Wijaya (Klinik Sehat)", "0274-882211", "klinik.sehat@example.com", "Jl. Kaliurang KM 8, Ngaglik"},
	{"Puskesmas Pembantu Jangkang", "0274-882212", "", "Jangkang, Ngemplak"},
	{"Suharti", "081227001020", "", "Pakembinangun RT 04, Pakem"},
}

// Demo staff. Password for all: demoPassword. Tills: shifts rotate over the first three.
type staffDef struct {
	username, fullname                            string
	products, purchases, categories, transactions bool
	active                                        bool
}

const demoPassword = "demo12345"

var staffDefs = []staffDef{
	{"demo_apoteker", "apt. Sari Wulandari", true, true, true, true, true},
	{"demo_gudang", "Andi Pratama", true, true, true, false, true},
	{"demo_spv", "Rina Kusuma", false, false, false, true, true},
	{"demo_kasir1", "Dewi Lestari", false, false, false, false, true},
	{"demo_kasir2", "Budi Hartanto", false, false, false, false, true},
	{"demo_kasir3", "Siti Aminah", false, false, false, false, true},
	{"demo_kasir4", "Agus Setiawan", false, false, false, false, true},
	{"demo_kasir5", "Fitri Handayani", false, false, false, false, true},
	{"demo_kasir6", "Rudi Hermawan", false, false, false, false, true},
	{"demo_kasir7", "Maya Sari", false, false, false, false, false},
}

var tillNames = []string{"Kasir Depan 1", "Kasir Depan 2", "Kasir Resep", "Kasir Belakang", "Drive Thru", "Kasir Online", "Kasir Lantai 2", "Kasir Klinik", "Kasir Cadangan", "Kasir Event"}
