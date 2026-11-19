# Week 2 : Price Model That Did Not Generalise

# Predicting a Ratio Instead of Rupees

## Error:

The first Random Forest, trained on raw rupee prices, looked
good on validation but failed on the test split.

> validation R2 = 0.953   |   test R2 = 0.623

## Relevant Context

Campus prices range from about ₹40 to ₹80,000. Trees trained
on raw prices learned *how expensive an item is*, not *how
fast it loses value*.

## Key Observation

Depreciation is a **ratio** of the original price, so the
target should be scale-free: `log(price / MRP)`.

## Solution

Scale-free target (`ml-service/training/train_price_model.py`):

``` python
y = np.log(np.clip(df["soldPrice"].to_numpy(dtype=float), 1, None) / originals)
```

Three quantile models (q10 / q50 / q90) with monotone
constraints:

``` python
QUANTILES = (0.10, 0.50, 0.90)

def fit_quantile(X, y, w, q):
    model = HistGradientBoostingRegressor(
        loss="quantile", quantile=q, max_iter=300, learning_rate=0.06, max_depth=6,
        min_samples_leaf=20, l2_regularization=1.0, monotonic_cst=monotonic_vector(), random_state=42,
    )
```

``` python
# older -> never worth more, better condition / demand -> never worth less
MONOTONIC = {"age_months": -1, "condition": 1, "demand": 1}
```

**Because**

On a ratio a ₹900 calculator and a ₹40,000 laptop are learned
on the same scale. The median gives the suggested price and
q10 to q90 gives the fair band. Result: test **MAPE 8.67 %**
against 43.92 % for a naive baseline.
