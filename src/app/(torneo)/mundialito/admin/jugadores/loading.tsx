import styles from "../admin.module.css";
export default function LoadingRoster() {
  return (
    <div className={styles.dashboard} role="status">
      Cargando nómina oficial…
    </div>
  );
}
