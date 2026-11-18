import { useState } from 'react';
import { Link } from 'react-router';
import './landing.css';

const photos = {
    pharmacist: 'https://images.pexels.com/photos/19471016/pexels-photo-19471016.jpeg?auto=compress&cs=tinysrgb&w=1600',
    pharmacy: 'https://images.pexels.com/photos/12332074/pexels-photo-12332074.jpeg?auto=compress&cs=tinysrgb&w=1000',
    medicine: '/images/landing/1ZOMOXPNDS.jpg',
    vitamins: '/images/landing/S5WGVL18A9.jpg',
    consultation: '/images/landing/EDI8LWKSBB.jpg',
    equipment: 'https://images.pexels.com/photos/5407246/pexels-photo-5407246.jpeg?auto=compress&cs=tinysrgb&w=800',
};

const services = [
    {
        title: 'Pelayanan Resep',
        image: photos.medicine,
        alt: 'Obat tablet dalam kemasan blister',
        text: 'Informasi ketersediaan obat dan pelayanan resep untuk kebutuhan pengobatan Anda.',
        action: 'Tanyakan Resep',
    },
    {
        title: 'Konsultasi Apoteker',
        image: photos.pharmacist,
        alt: 'Apoteker mencatat informasi di apotek',
        text: 'Tanyakan informasi obat dan cara penggunaannya kepada apoteker sebelum Anda pulang.',
        action: 'Tanya Apoteker',
    },
    {
        title: 'Obat & Vitamin',
        image: photos.vitamins,
        alt: 'Beragam tablet dan kapsul obat',
        text: 'Temukan kebutuhan obat, vitamin, dan suplemen untuk melengkapi perawatan keluarga.',
        action: 'Cek Ketersediaan',
    },
    {
        title: 'Kebutuhan Keluarga',
        image: photos.consultation,
        alt: 'Konsultasi kesehatan bersama tenaga kesehatan',
        text: 'Bicarakan kebutuhan kesehatan orang tua dan keluarga agar pilihan produk lebih sesuai.',
        action: 'Tanya Produk',
    },
    {
        title: 'Alat Kesehatan',
        image: photos.equipment,
        alt: 'Stetoskop, termometer, dan perlengkapan kesehatan',
        text: 'Informasi perlengkapan kesehatan untuk membantu perawatan dan pemantauan di rumah.',
        action: 'Tanya Ketersediaan',
    },
];

const highlights = [
    ['prescriptions', 'Pelayanan Resep', 'Kebutuhan pengobatan'],
    ['clinical_notes', 'Konsultasi', 'Informasi penggunaan obat'],
    ['pill', 'Obat & Vitamin', 'Kebutuhan sehari-hari'],
    ['family_restroom', 'Untuk Keluarga', 'Perawatan di rumah'],
    ['medical_services', 'Alat Kesehatan', 'Perlengkapan perawatan'],
];

const benefits = [
    ['prescriptions', 'Pelayanan Resep', 'Tanyakan ketersediaan obat sesuai resep yang Anda bawa.'],
    ['clinical_notes', 'Informasi dari Apoteker', 'Ruang untuk bertanya dan memahami penggunaan obat Anda.'],
    ['medication', 'Kebutuhan dalam Satu Tempat', 'Obat, vitamin, dan perlengkapan kesehatan keluarga.'],
    ['diversity_1', 'Pelayanan yang Ramah', 'Kebutuhan dan pertanyaan Anda menjadi perhatian kami.'],
    ['payments', 'Informasi Harga', 'Ketahui harga dan pilihan produk sebelum melakukan pembelian.'],
    ['health_and_safety', 'Pendamping Kesehatan', 'Membantu Anda lebih memahami kebutuhan perawatan sehari-hari.'],
];

const questions = [
    [
        'Bagaimana cara menanyakan ketersediaan obat?',
        'Siapkan nama obat, kekuatan, dan jumlah yang dibutuhkan, lalu tanyakan kepada petugas apotek. Ketersediaan dan harga perlu dikonfirmasi sebelum pembelian.',
    ],
    ['Apa yang perlu dibawa untuk menebus resep?', 'Bawa resep dari dokter agar apoteker dapat memeriksa kebutuhan obat Anda. Sampaikan juga informasi yang diminta petugas saat pelayanan.'],
    ['Apakah saya bisa bertanya tentang penggunaan obat?', 'Silakan sampaikan pertanyaan Anda kepada apoteker saat pelayanan, termasuk informasi pada label dan kemasan obat yang belum dipahami.'],
    ['Apakah tersedia vitamin dan alat kesehatan?', 'Silakan konfirmasi produk, merek, dan jumlah yang Anda butuhkan kepada petugas. Pilihan produk mengikuti persediaan apotek.'],
    ['Di mana saya bisa melihat jam buka dan kontak apotek?', 'Informasi alamat, jam operasional, dan nomor kontak akan ditampilkan pada bagian Kontak setelah data apotek tersedia.'],
];

const navigation = [
    ['#beranda', 'Beranda'],
    ['#tentang', 'Tentang Kami'],
    ['#layanan', 'Layanan Apotek'],
    ['#faq', 'FAQ'],
    ['#kontak', 'Kontak'],
];

function Icon({ name }: { name: string }) {
    return (
        <span className="material-symbols-outlined" aria-hidden="true">
            {name}
        </span>
    );
}

export default function Landing() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="pharmacy-landing" id="beranda">
            <title>Apotek | Obat, Vitamin & Kesehatan Keluarga</title>
            <meta name="description" content="Informasi layanan apotek, pelayanan resep, konsultasi apoteker, obat, vitamin, dan kebutuhan kesehatan keluarga." />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" />
            <a href="#isi" className="lp-skip">
                Langsung ke isi halaman
            </a>

            <div className="lp-topbar">
                <div className="lp-container">
                    <span>
                        <Icon name="local_pharmacy" /> Sahabat kesehatan keluarga
                    </span>
                    <a href="#layanan">
                        <Icon name="prescriptions" /> Pelayanan resep & informasi obat
                    </a>
                    <a href="#kontak">
                        <Icon name="location_on" /> Informasi apotek
                    </a>
                </div>
            </div>

            <header className="lp-header">
                <div className="lp-container lp-header-inner">
                    <a className="lp-brand" href="#beranda" aria-label="Apotek, beranda">
                        apotek<span>.</span>
                    </a>
                    <button
                        className="lp-menu-toggle"
                        type="button"
                        aria-expanded={menuOpen}
                        aria-controls="lp-navigation"
                        aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
                        onClick={() => setMenuOpen(!menuOpen)}
                    >
                        <Icon name={menuOpen ? 'close' : 'menu'} />
                    </button>
                    <nav
                        id="lp-navigation"
                        className={`lp-nav${menuOpen ? ' is-open' : ''}`}
                        aria-label="Navigasi utama"
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setMenuOpen(false);
                        }}
                    >
                        {navigation.map(([href, label]) => (
                            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                                {label}
                            </a>
                        ))}
                        <Link className="lp-button lp-login" to="/login">
                            Masuk POS <Icon name="login" />
                        </Link>
                    </nav>
                </div>
            </header>

            <main id="isi">
                <section className="lp-hero" aria-labelledby="lp-hero-title">
                    <img className="lp-hero-photo" src={photos.pharmacist} alt="Apoteker bekerja di antara rak obat" fetchPriority="high" />
                    <div className="lp-container lp-hero-inner">
                        <div className="lp-hero-copy">
                            <p className="lp-eyebrow">APOTEK & KESEHATAN KELUARGA</p>
                            <h1 id="lp-hero-title">
                                Sahabat Sehat<span>untuk Keluarga Anda</span>
                            </h1>
                            <p>Lengkapi kebutuhan kesehatan keluarga dengan pelayanan resep, informasi dari apoteker, obat, vitamin, dan perlengkapan kesehatan dalam satu tempat.</p>
                            <a className="lp-button" href="#layanan">
                                Lihat Layanan Apotek <Icon name="medical_services" />
                            </a>
                        </div>
                    </div>
                </section>

                <div className="lp-highlights" aria-label="Layanan apotek">
                    <div className="lp-wide">
                        {highlights.map(([icon, title, text]) => (
                            <div className="lp-highlight" key={title}>
                                <Icon name={icon} />
                                <div>
                                    <strong>{title}</strong>
                                    <span>{text}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <section className="lp-services lp-wide" id="layanan" aria-labelledby="lp-services-title">
                    <div className="lp-section-heading">
                        <h2 id="lp-services-title">Layanan Apotek & Kesehatan Keluarga</h2>
                        <p>Kebutuhan kesehatan Anda dan keluarga, mulai dari sini</p>
                    </div>
                    <div className="lp-service-grid">
                        {services.map((service) => (
                            <article className="lp-service-card" key={service.title}>
                                <img src={service.image} alt={service.alt} loading="lazy" width="600" height="600" />
                                <div className="lp-service-body">
                                    <h3>{service.title}</h3>
                                    <p>{service.text}</p>
                                    <a className="lp-button" href="#kontak">
                                        {service.action}
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                    <a className="lp-button lp-services-more" href="#tentang">
                        Kenali Apotek Kami
                    </a>
                </section>

                <section className="lp-about lp-container" id="tentang" aria-labelledby="lp-about-title">
                    <div className="lp-about-intro">
                        <figure>
                            <img src={photos.pharmacy} alt="Suasana pelayanan di sebuah apotek" loading="lazy" width="1000" height="680" />
                            <figcaption>Foto ilustrasi pelayanan apotek</figcaption>
                        </figure>
                        <div>
                            <p className="lp-eyebrow">KENAPA KAMI</p>
                            <h2 id="lp-about-title">
                                Lebih Dekat dengan
                                <br />
                                Kesehatan Keluarga
                            </h2>
                            <p>Kami ingin membantu Anda menemukan kebutuhan kesehatan dan memahami penggunaan obat dengan lebih baik, melalui pelayanan yang ramah dan informasi yang jelas.</p>
                            <a className="lp-button" href="#kontak">
                                Informasi & Kontak Apotek
                            </a>
                        </div>
                    </div>
                    <div className="lp-benefits">
                        {benefits.map(([icon, title, text]) => (
                            <div className="lp-benefit" key={title}>
                                <Icon name={icon} />
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="lp-reviews" id="ulasan" aria-labelledby="lp-reviews-title">
                    <div className="lp-container">
                        <div className="lp-section-heading">
                            <p className="lp-eyebrow">CERITA PELANGGAN</p>
                            <h2 id="lp-reviews-title">Pengalaman Anda Berarti bagi Kami</h2>
                        </div>
                        <div className="lp-review-empty">
                            <Icon name="forum" />
                            <p>Belum ada ulasan pelanggan yang dipublikasikan.</p>
                            <span>Bagikan pengalaman dan masukan Anda kepada petugas saat berkunjung.</span>
                        </div>
                        <div className="lp-gallery" aria-label="Ilustrasi kebutuhan kesehatan">
                            {services.slice(0, 4).map((service) => (
                                <figure key={service.title}>
                                    <img src={service.image} alt={service.alt} loading="lazy" width="420" height="480" />
                                    <figcaption>{service.title}</figcaption>
                                </figure>
                            ))}
                        </div>
                        <p className="lp-photo-note">Foto ilustrasi, bukan dokumentasi pelanggan atau fasilitas apotek.</p>
                    </div>
                </section>

                <section className="lp-faq lp-container" id="faq" aria-labelledby="lp-faq-title">
                    <div className="lp-section-heading">
                        <p className="lp-eyebrow">FAQ</p>
                        <h2 id="lp-faq-title">
                            Pertanyaan yang Sering
                            <br />
                            Diajukan
                        </h2>
                    </div>
                    <div className="lp-questions">
                        {questions.map(([question, answer], index) => (
                            <details key={question} name="pharmacy-faq" open={index === 0}>
                                <summary>
                                    {question}
                                    <Icon name="expand_more" />
                                </summary>
                                <p>{answer}</p>
                            </details>
                        ))}
                    </div>
                </section>

                <section className="lp-contact lp-container" id="kontak" aria-labelledby="lp-contact-title">
                    <div className="lp-contact-banner">
                        <img src={photos.pharmacist} alt="Ilustrasi apoteker di ruang pelayanan" loading="lazy" width="400" height="400" />
                        <div>
                            <h2 id="lp-contact-title">
                                Ada Kebutuhan Obat
                                <br />
                                untuk Keluarga?
                            </h2>
                            <p>Kenali layanan dan persiapkan pertanyaan Anda sebelum berkunjung.</p>
                        </div>
                        <a className="lp-button lp-button-light" href="#faq">
                            Informasi Pelayanan <Icon name="arrow_forward" />
                        </a>
                    </div>
                    <div className="lp-contact-status">
                        <Icon name="info" />
                        <p>Alamat, nomor kontak, dan jam operasional apotek belum tersedia.</p>
                    </div>
                </section>
            </main>

            <footer className="lp-footer lp-container">
                <div className="lp-category-strip">
                    <span>Kebutuhan kesehatan Anda:</span>
                    <strong>Obat & Resep</strong>
                    <strong>Vitamin</strong>
                    <strong>Perawatan Keluarga</strong>
                    <strong>Alat Kesehatan</strong>
                </div>
                <div className="lp-footer-grid">
                    <div>
                        <a className="lp-brand" href="#beranda">
                            apotek<span>.</span>
                        </a>
                        <p>Teman untuk kebutuhan kesehatan keluarga. Temukan informasi pelayanan resep, obat, vitamin, dan perlengkapan kesehatan di sini.</p>
                    </div>
                    <div>
                        <h3>Jelajahi</h3>
                        {navigation.map(([href, label]) => (
                            <a key={href} href={href}>
                                {label}
                            </a>
                        ))}
                    </div>
                    <div>
                        <h3>Layanan Apotek</h3>
                        {services.map(({ title }) => (
                            <a key={title} href="#layanan">
                                {title}
                            </a>
                        ))}
                    </div>
                    <div>
                        <h3>Informasi Apotek</h3>
                        <p>Data kontak dan jam operasional akan ditampilkan setelah tersedia.</p>
                        <Link className="lp-staff-link" to="/login">
                            <Icon name="login" /> Masuk untuk staf
                        </Link>
                        <details className="lp-photo-credits">
                            <summary>Sumber foto</summary>
                            <a href="https://www.pexels.com/photo/young-pharmacist-writing-notes-19471016/" target="_blank" rel="noreferrer">
                                BYB BYB / Pexels
                            </a>
                            <a href="https://www.pexels.com/photo/woman-in-a-pharmacy-12332074/" target="_blank" rel="noreferrer">
                                Jose Ismael Espinola / Pexels
                            </a>
                            <a href="https://www.pexels.com/photo/stethoscope-and-notebook-on-desk-5407246/" target="_blank" rel="noreferrer">
                                Tima Miroshnichenko / Pexels
                            </a>
                            <a href="https://stocksnap.io/author/20064" target="_blank" rel="noreferrer">
                                Freestocks.org / StockSnap (CC0)
                            </a>
                            <a href="https://stocksnap.io/photo/doctor-patient-EDI8LWKSBB" target="_blank" rel="noreferrer">
                                Direct Media / StockSnap (CC0)
                            </a>
                        </details>
                    </div>
                </div>
                <div className="lp-copyright">© {new Date().getFullYear()} Apotek. Kesehatan keluarga, perhatian bersama.</div>
            </footer>
            <a className="lp-floating-contact" href="#kontak" aria-label="Lihat informasi kontak apotek">
                <span>Informasi Apotek</span>
                <Icon name="chat" />
            </a>
        </div>
    );
}
