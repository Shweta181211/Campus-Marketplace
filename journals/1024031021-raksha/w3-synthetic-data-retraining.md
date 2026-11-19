# Week 3 : No Real Sales Data to Train On

# Synthetic Data, Retraining and Sanity Tests

## Problem:

A new marketplace has no completed trades, so there was
nothing real to learn from.

## Relevant Context

The model still needs thousands of rows. Presenting accuracy
on made-up data as real market accuracy would be misleading.

## Key Observation

Generate **realistic** synthetic data, label it clearly, and
build a path to replace it with real sales later.

## Solution

Per-class exponential depreciation towards a floor
(`ml-service/training/generate_seed.py`, 6,000 rows):

``` python
def sale_value(klass, original, condition, age, demand, brand, noise):
    _, _, decay, floor, _, _ = CLASSES[klass]
    curve = floor + (1 - floor) * math.exp(-decay * age)
```

Export only real, verified sales (`server/scripts/exportTrainingData.js`):

``` javascript
const paid = await Payment.find({ status: 'paid', verified: true, isSeed: { $ne: true } }).lean()
```

If the saved model cannot be loaded, the service retrains at
start-up (`ml-service/app/services/model_store.py`):

``` python
try:
    bundle = joblib.load(PRICE_BUNDLE)
except Exception as exc:  # incompatible scikit-learn version, corrupt file...
    return None
```

Eight behaviour tests check the model after every retrain
(`ml-service/tests/test_price.py`):

``` python
def test_band_contains_recommendation(self):
    r = predict()
    self.assertLessEqual(r["minFairPrice"], r["recommendedPrice"])
    self.assertLessEqual(r["recommendedPrice"], r["maxFairPrice"])
```

``` shell
$ npm run test:ml
Ran 8 tests ... OK
```

**Because**

The pipeline works today and improves as real trades arrive,
and the tests catch a broken model before sellers see it.
Real rows are weighted 5×, and the metrics file says
"trained on synthetic data".
