"""CLI to export training dataset CSV from DB.

Usage: python export_dataset.py --out training.csv --limit 1000
"""
from app.services.dataset import export_csv


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='training_dataset.csv')
    parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args()
    path, n = export_csv(args.out, args.limit)
    print(f'Exported {n} rows to {path}')


if __name__ == '__main__':
    main()
