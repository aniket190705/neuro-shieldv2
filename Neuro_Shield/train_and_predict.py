import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "telemetry_data.csv"
MODEL_PATH = BASE_DIR / "fatigue_model.pkl"
FEATURE_COLUMNS = ["keys", "mouse_distance", "tab_switches"]


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def derive_risk(keys, mouse_distance, tab_switches):
    score = 0.0

    if keys < 75:
        score += 1.5
    elif keys < 150:
        score += 1.0
    else:
        score -= 0.2

    if mouse_distance < 120:
        score += 1.0
    elif mouse_distance < 260:
        score += 0.5
    else:
        score -= 0.2

    if tab_switches >= 18:
        score += 1.5
    elif tab_switches >= 10:
        score += 0.8

    if keys < 90 and tab_switches >= 14:
        score += 1.8

    if keys > 220 and mouse_distance > 320 and tab_switches < 8:
        score -= 0.8

    if score >= 3.2:
        return 2
    if score >= 1.7:
        return 1
    return 0


def build_synthetic_dataset(row_count=1500):
    records = []

    for index in range(row_count):
        keys = 20 + ((index * 37 + 11) % 281)
        mouse_distance = round(15 + ((index * 29 + 7) % 486) + ((index % 9) * 0.37), 2)
        tab_switches = (index * 11 + 5) % 26

        if index % 10 == 0:
            keys = 30 + (index % 45)
            tab_switches = 15 + (index % 10)

        if index % 14 == 0:
            keys = 210 + (index % 70)
            mouse_distance = round(280 + (index % 160) + 0.25, 2)
            tab_switches = index % 7

        if index % 17 == 0:
            mouse_distance = round(40 + (index % 70) + 0.5, 2)

        risk = derive_risk(keys, mouse_distance, tab_switches)

        if index % 23 == 0 and risk > 0:
            risk -= 1
        elif index % 31 == 0 and risk < 2:
            risk += 1

        records.append(
            {
                "keys": int(clamp(keys, 0, 400)),
                "mouse_distance": float(round(clamp(mouse_distance, 0.0, 700.0), 2)),
                "tab_switches": int(clamp(tab_switches, 0, 30)),
                "risk_index": int(clamp(risk, 0, 2)),
            }
        )

    return pd.DataFrame(records)


def ensure_dataset():
    dataset = build_synthetic_dataset()
    dataset.to_csv(DATA_PATH, index=False)
    return dataset


def train_and_save_model(verbose=True):
    dataset = ensure_dataset()
    features = dataset[FEATURE_COLUMNS]
    labels = dataset["risk_index"]

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=labels,
    )

    models = {
        "random_forest": RandomForestClassifier(
            n_estimators=250,
            max_depth=8,
            random_state=42,
        ),
        "xgboost": XGBClassifier(
            n_estimators=250,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="multi:softprob",
            num_class=3,
            eval_metric="mlogloss",
            random_state=42,
        ),
    }

    best_name = None
    best_model = None
    best_accuracy = -1.0

    for model_name, model in models.items():
        model.fit(x_train, y_train)
        predictions = model.predict(x_test)
        accuracy = accuracy_score(y_test, predictions)

        if accuracy > best_accuracy:
            best_name = model_name
            best_model = model
            best_accuracy = accuracy

    joblib.dump(
        {
            "model_name": best_name,
            "accuracy": best_accuracy,
            "feature_columns": FEATURE_COLUMNS,
            "model": best_model,
        },
        MODEL_PATH,
    )

    if verbose:
        print(
            json.dumps(
                {
                    "dataset_path": str(DATA_PATH),
                    "model_path": str(MODEL_PATH),
                    "best_model": best_name,
                    "accuracy": round(best_accuracy, 4),
                }
            )
        )


def load_model_bundle():
    if not MODEL_PATH.exists():
        train_and_save_model(verbose=False)
    return joblib.load(MODEL_PATH)


def predict_risk(keys, mouse_distance, tab_switches):
    bundle = load_model_bundle()
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]

    frame = pd.DataFrame(
        [
            {
                "keys": int(keys),
                "mouse_distance": float(mouse_distance),
                "tab_switches": int(tab_switches),
            }
        ]
    )[feature_columns]

    risk_index = int(model.predict(frame)[0])
    probabilities = model.predict_proba(frame)[0]
    probability = round(float(probabilities[risk_index]), 4)

    return {"risk_index": risk_index, "probability": probability}


def main():
    if len(sys.argv) == 4:
        keys = int(sys.argv[1])
        mouse_distance = float(sys.argv[2])
        tab_switches = int(sys.argv[3])
        print(json.dumps(predict_risk(keys, mouse_distance, tab_switches)))
        return

    train_and_save_model()


if __name__ == "__main__":
    main()
