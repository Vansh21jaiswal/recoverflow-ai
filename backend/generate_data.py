"""CLI to create database tables and generate synthetic checkout events."""
import argparse
from app.database import engine, SessionLocal, Base
from app.services.synthetic import generate_checkouts


def main(count: int, seed: int):
    print(f"Creating tables and generating {count} synthetic checkouts (seed={seed})...")
    Base.metadata.create_all(bind=engine)
    items = generate_checkouts(n=count, seed=seed)
    db = SessionLocal()
    try:
        db.bulk_save_objects(items)
        db.commit()
        print(f"Inserted {len(items)} rows into the database.")
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--count', type=int, default=1000)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    main(args.count, args.seed)
