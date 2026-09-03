import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else '../frontend/recoverflow.db'

def main(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        total = cur.execute('select count(*) from checkouts').fetchone()[0]
    except Exception as e:
        print('Error querying DB:', e)
        return

    print('DB:', db_path)
    print('Total rows:', total)
    print('\nPayment status distribution:')
    for r in cur.execute("select payment_status, count(*) from checkouts group by payment_status"):
        print(f"{r[0]}: {r[1]}")

    print('\nBest recovery action distribution:')
    for r in cur.execute("select best_recovery_action, count(*) as cnt from checkouts group by best_recovery_action order by cnt desc"):
        print(f"{r[0]}: {r[1]}")

    rar = cur.execute("select coalesce(sum(cart_value),0) from checkouts where payment_status in ('failed','abandoned') and recovery_eligible=1").fetchone()[0]
    print('\nTotal revenue at risk:', rar)

    conn.close()


if __name__ == '__main__':
    main(DB)
