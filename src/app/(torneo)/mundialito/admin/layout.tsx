import type { Metadata } from "next";
import styles from "./admin.module.css";
import { AdminNavigation } from "./admin-navigation";
export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.area}>
      <AdminNavigation>{children}</AdminNavigation>
    </div>
  );
}
