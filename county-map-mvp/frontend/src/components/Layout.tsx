import type { ReactNode } from 'react';
import styles from './Layout.module.css';

interface Props {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  filters: ReactNode;
  children: ReactNode;
}

export default function Layout({ title, subtitle, status, filters, children }: Props) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {status ? <div className={styles.status}>{status}</div> : null}
      </header>
      <section className={styles.filters}>{filters}</section>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
