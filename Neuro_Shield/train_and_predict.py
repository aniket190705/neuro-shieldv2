import json
import random
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
FEATURE_COLUMNS = ["keys", "mouse_distance", "tab_switches", "backspaces"]
FEATURE_WEIGHTS = {
    "backspaces": 0.4,
    "tab_switches": 0.3,
    "keys": 0.2,
    "mouse_distance": 0.1,
}


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def compute_feature_components(keys, mouse_distance, tab_switches, backspaces):
    reader_mode = (
        keys == 0
        and tab_switches == 0
        and mouse_distance < 500
        and backspaces <= 1
    )

    if reader_mode:
        return {
            "reader_mode": True,
            "keys": 0.0,
            "mouse_distance": 0.0,
            "tab_switches": 0.0,
            "backspaces": 0.0,
        }

    if keys >= 15:
        keys_component = 0.05
    elif keys >= 5:
        keys_component = 0.55
    else:
        keys_component = 1.0

    if mouse_distance < 1000:
        mouse_component = 0.1
    elif mouse_distance < 2000:
        mouse_component = 0.45
    else:
        mouse_component = 0.8

    if tab_switches <= 1:
        tab_component = 0.05
    elif tab_switches == 2:
        tab_component = 0.6
    else:
        tab_component = 1.0

    if backspaces <= 2:
        backspace_component = 0.05
    elif backspaces <= 5:
        backspace_component = 0.6
    else:
        backspace_component = 1.0

    return {
        "reader_mode": False,
        "keys": keys_component,
        "mouse_distance": mouse_component,
        "tab_switches": tab_component,
        "backspaces": backspace_component,
    }


def compute_fatigue_delta(keys, mouse_distance, tab_switches, backspaces):
    components = compute_feature_components(
        keys, mouse_distance, tab_switches, backspaces
    )

    if components["reader_mode"]:
        return 0.0

    delta = sum(
        FEATURE_WEIGHTS[feature] * components[feature]
        for feature in FEATURE_COLUMNS
    )

    if backspaces >= 6 and keys <= 4:
        delta += 0.12

    if tab_switches >= 3 and backspaces >= 6:
        delta += 0.08

    if keys <= 4 and mouse_distance >= 2000:
        delta += 0.06

    if keys >= 15 and backspaces <= 2 and tab_switches <= 1:
        delta -= 0.08

    return round(clamp(delta, 0.0, 1.0), 4)


def derive_risk(keys, mouse_distance, tab_switches, backspaces):
    fatigue_delta = compute_fatigue_delta(
        keys, mouse_distance, tab_switches, backspaces
    )

    if fatigue_delta >= 0.72:
        return 2
    if fatigue_delta >= 0.36:
        return 1
    return 0


def build_synthetic_dataset(row_count=1500):
    rng = random.Random(42)
    records = []

    samples_per_state = row_count // 3

    def add_record(keys, mouse_distance, tab_switches, backspaces):
        risk = derive_risk(keys, mouse_distance, tab_switches, backspaces)
        records.append(
            {
                "keys": int(clamp(keys, 0, 40)),
                "mouse_distance": float(round(clamp(mouse_distance, 0.0, 5000.0), 2)),
                "tab_switches": int(clamp(tab_switches, 0, 10)),
                "backspaces": int(clamp(backspaces, 0, 20)),
                "risk_index": int(clamp(risk, 0, 2)),
            }
        )

    for _ in range(samples_per_state):
        low_mode = rng.choice(["focused", "reader"])

        if low_mode == "reader":
            keys = rng.randint(0, 3)
            mouse_distance = rng.uniform(0, 450)
            tab_switches = 0
            backspaces = rng.randint(0, 1)
        else:
            keys = rng.randint(15, 28)
            mouse_distance = rng.uniform(150, 900)
            tab_switches = rng.randint(0, 1)
            backspaces = rng.randint(0, 2)

        add_record(keys, mouse_distance, tab_switches, backspaces)

    for _ in range(samples_per_state):
        keys = rng.randint(5, 14)
        mouse_distance = rng.uniform(1000, 2000)
        tab_switches = 2
        backspaces = rng.randint(3, 5)

        if rng.random() < 0.2:
            mouse_distance += rng.uniform(-250, 250)
        if rng.random() < 0.2:
            backspaces += rng.choice([-1, 1])

        add_record(keys, mouse_distance, tab_switches, backspaces)

    for _ in range(row_count - (samples_per_state * 2)):
        keys = rng.randint(0, 4)
        mouse_distance = rng.uniform(2000, 4200)
        tab_switches = rng.randint(3, 6)
        backspaces = rng.randint(6, 12)

        if rng.random() < 0.15:
            keys = rng.randint(2, 7)
        if rng.random() < 0.15:
            mouse_distance += rng.uniform(-400, 400)

        add_record(keys, mouse_distance, tab_switches, backspaces)

    for _ in range(max(30, row_count // 12)):
        keys = rng.randint(0, 18)
        mouse_distance = rng.uniform(200, 2800)
        tab_switches = rng.randint(0, 5)
        backspaces = rng.randint(0, 8)

        add_record(keys, mouse_distance, tab_switches, backspaces)

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


def predict_risk(keys, mouse_distance, tab_switches, backspaces):
    bundle = load_model_bundle()
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]

    frame = pd.DataFrame(
        [
            {
                "keys": int(keys),
                "mouse_distance": float(mouse_distance),
                "tab_switches": int(tab_switches),
                "backspaces": int(backspaces),
            }
        ]
    )[feature_columns]

    risk_index = int(model.predict(frame)[0])
    probabilities = model.predict_proba(frame)[0]
    probability = round(float(probabilities[risk_index]), 4)
    fatigue_delta = compute_fatigue_delta(
        keys, mouse_distance, tab_switches, backspaces
    )

    return {
        "risk_index": risk_index,
        "probability": probability,
        "fatigue_delta": fatigue_delta,
        "feature_weights": FEATURE_WEIGHTS,
    }


def main():
    if len(sys.argv) == 5:
        keys = int(sys.argv[1])
        mouse_distance = float(sys.argv[2])
        tab_switches = int(sys.argv[3])
        backspaces = int(sys.argv[4])
        print(json.dumps(predict_risk(keys, mouse_distance, tab_switches, backspaces)))
        return

    train_and_save_model()


if __name__ == "__main__":
    main()
