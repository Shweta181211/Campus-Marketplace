"""Train every model the API serves:  python3 ml-service/training/train_all.py   (npm run ml:train)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from training import generate_fraud_data, generate_seed, train_fraud_model, train_price_model  # noqa: E402


def main():
    generate_seed.main()
    generate_fraud_data.main()
    train_price_model.main()
    train_fraud_model.main()


if __name__ == "__main__":
    main()
