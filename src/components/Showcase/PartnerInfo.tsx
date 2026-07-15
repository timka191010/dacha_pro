import styles from './ShowcasePage.module.css';

export function PartnerInfo() {
  return (
    <div className={styles.partner}>
      <div className={styles.partnerLogo}>ОМ</div>
      <p className={styles.partnerName}>Органик Микс</p>
      <p className={styles.partnerTag}>
        Российский производитель органических удобрений и стимуляторов
      </p>
      <p className={styles.partnerContact}>
        🌐 <a href="https://organic-mix.ru/" target="_blank" rel="noopener noreferrer">organic-mix.ru</a>
      </p>
      <p className={styles.partnerContact}>📞 <a href="tel:88007771357">8-800-777-1357</a></p>
      <p className={styles.partnerContact}>✉️ <a href="mailto:sale@organic-mix.ru">sale@organic-mix.ru</a></p>
    </div>
  );
}
