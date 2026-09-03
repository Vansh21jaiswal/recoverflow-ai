"""Synthetic checkout event generator for RecoverFlow AI."""
from faker import Faker
import random
import uuid
import datetime
from typing import List
from app.models.checkout import CheckoutEvent


fake = Faker()


def choose_with_probs(items, probs):
    return random.choices(items, weights=probs, k=1)[0]


def generate_single(i):
    # Base identities
    checkout_id = str(uuid.uuid4())
    customer_id = f"cust_{random.randint(1,500)}"
    merchant_id = f"mrc_{random.randint(1,20)}"

    # Time
    created_at = fake.date_time_between(start_date='-90d', end_date='now')
    updated_at = created_at + datetime.timedelta(seconds=random.randint(0, 3600))

    # Customer segment
    customer_segment = choose_with_probs(
        ['new', 'returning', 'high_value', 'at_risk'], [0.25, 0.45, 0.15, 0.15]
    )

    product_category = choose_with_probs(
        ['electronics', 'fashion', 'home', 'beauty', 'sports', 'groceries'], [0.2,0.2,0.15,0.15,0.15,0.15]
    )

    # Cart value influenced by customer segment
    base = random.uniform(200, 2000)
    if customer_segment == 'high_value':
        base *= random.uniform(2.0, 5.0)
    elif customer_segment == 'new':
        base *= random.uniform(0.8, 1.2)
    cart_value = round(base, 2)

    currency = 'INR'

    payment_methods = ['card', 'upi', 'net_banking', 'wallet']
    payment_method = choose_with_probs(payment_methods, [0.5, 0.25, 0.15, 0.1])

    # Payment status probabilities depend on payment method
    status_choices = ['completed', 'failed', 'abandoned', 'initiated']
    # base probs
    probs = {
        'card': [0.82, 0.08, 0.08, 0.02],
        'upi': [0.86, 0.04, 0.08, 0.02],
        'net_banking': [0.80, 0.10, 0.08, 0.02],
        'wallet': [0.88, 0.03, 0.07, 0.02],
    }
    payment_status = choose_with_probs(status_choices, probs[payment_method])

    # Failure reasons for failed
    temp_reasons = ['bank_timeout', 'upi_timeout', 'gateway_timeout', 'insufficient_funds']
    hard_reasons = ['suspected_fraud', 'compliance_hold']

    failure_reason = None
    if payment_status == 'failed':
        # some failures are hard
        if random.random() < 0.05:
            failure_reason = random.choice(hard_reasons)
        else:
            failure_reason = random.choice(temp_reasons + ['card_declined'])

    # Checkout stage and behaviour
    checkout_stage = choose_with_probs(['cart','payment_selection','payment_processing','confirmation'], [0.1,0.4,0.3,0.2])
    attempt_count = random.choices([1,2,3,4], weights=[0.7,0.2,0.08,0.02], k=1)[0]

    # time on checkout depends on stage
    stage_time = {
        'cart': (10, 180),
        'payment_selection': (5, 120),
        'payment_processing': (2, 30),
        'confirmation': (1, 10),
    }
    tmin, tmax = stage_time.get(checkout_stage, (5,60))
    time_on_checkout_seconds = random.randint(tmin, tmax)

    device_type = choose_with_probs(['mobile','desktop'], [0.7, 0.3])
    hour_of_day = random.randint(0,23)

    # Previous orders
    if customer_segment == 'new':
        previous_successful_orders = 0
    elif customer_segment == 'high_value':
        previous_successful_orders = random.randint(5,50)
    else:
        previous_successful_orders = random.randint(1,10)

    previous_failed_payments = random.choices([0,1,2,3], weights=[0.7,0.2,0.08,0.02], k=1)[0]

    # risk score higher for high cart value and previous failed payments
    risk_score = min(0.99, round((cart_value / 10000.0) + (previous_failed_payments * 0.05) + random.uniform(0,0.2), 3))

    # Determine recovery eligibility and best action
    recovery_eligible = False
    best_recovery_action = 'no_action'
    recovery_probability = 0.0
    # default label values
    applied_recovery_action = None
    recovered = False
    recovered_amount = 0.0
    recovered_at = None
    recovery_horizon_days = None

    if payment_status in ('failed','abandoned'):
        # Ineligible if hard failure reasons
        if failure_reason in hard_reasons:
            recovery_eligible = False
            best_recovery_action = 'human_review'
            recovery_probability = 0.01
            # Labels for hard failures
            applied_recovery_action = 'human_review'
            recovered = False
            recovered_amount = 0.0
            recovered_at = None
            recovery_horizon_days = None
        else:
            recovery_eligible = True
            # Heuristic rules to pick best action
            if failure_reason in ['bank_timeout', 'gateway_timeout', 'upi_timeout']:
                best_recovery_action = 'retry_payment'
            elif payment_status == 'abandoned' and time_on_checkout_seconds < 20:
                best_recovery_action = 'send_reminder'
            elif previous_failed_payments >= 2:
                best_recovery_action = 'switch_payment_method'
            elif customer_segment == 'high_value' and payment_status == 'abandoned':
                best_recovery_action = 'offer_small_incentive'
            else:
                # default
                best_recovery_action = choose_with_probs(
                    ['retry_payment','send_reminder','switch_payment_method'], [0.5,0.35,0.15]
                )

            # adjust probability by customer and cart value
            base_prob = 0.2
            if best_recovery_action == 'retry_payment':
                base_prob = 0.35
            elif best_recovery_action == 'send_reminder':
                base_prob = 0.25
            elif best_recovery_action == 'switch_payment_method':
                base_prob = 0.3
            elif best_recovery_action == 'offer_small_incentive':
                base_prob = 0.6

            # modifiers
            if customer_segment == 'high_value':
                base_prob += 0.15
            if previous_successful_orders > 5:
                base_prob += 0.05
            if risk_score > 0.5:
                base_prob -= 0.2

            recovery_probability = max(0.01, min(0.95, round(base_prob + random.uniform(-0.05, 0.05), 3)))

            # Choose applied recovery action probabilistically so training isn't trivially leaked
            # Give higher weight to the heuristic best action but allow other actions to appear
            possible_actions = ['retry_payment', 'switch_payment_method', 'send_reminder', 'offer_small_incentive', 'human_review', 'no_action']
            weights = []
            for a in possible_actions:
                if a == best_recovery_action:
                    weights.append(3.0)
                else:
                    weights.append(1.0)
            # small bias: send_reminder more common for abandoned
            if payment_status == 'abandoned':
                for i, a in enumerate(possible_actions):
                    if a == 'send_reminder':
                        weights[i] += 1.0

            applied_recovery_action = random.choices(possible_actions, weights=weights, k=1)[0]

            # Effectiveness multipliers for applied actions (relative)
            effectiveness = {
                'retry_payment': 1.0,
                'switch_payment_method': 0.9,
                'send_reminder': 0.7,
                'offer_small_incentive': 1.15,
                'human_review': 0.25,
                'no_action': 0.01,
            }

            # Adjust recovery probability based on the applied action effectiveness and other signals
            eff = effectiveness.get(applied_recovery_action, 0.8)
            # Combine base recovery_probability (which reflects the best action) with effectiveness
            p_applied = max(0.0, min(0.99, round(recovery_probability * eff + random.uniform(-0.05, 0.05), 3)))

            # Decide whether recovery happened using the action-conditioned probability
            recovered = random.random() < p_applied
            recovered_amount = round(cart_value if recovered else 0.0, 2)
            # If recovered, choose a recovery timestamp within a short horizon (1-21 days)
            if recovered:
                horizon = random.randint(1, 21)
                recovered_at = created_at + datetime.timedelta(days=horizon)
                recovery_horizon_days = horizon
            else:
                recovered_at = None
                recovery_horizon_days = random.randint(7, 60)

    # Ensure some completed checkouts have recovery fields default
    if payment_status == 'completed':
        recovery_eligible = False
        best_recovery_action = 'no_action'
        recovery_probability = 0.0

    return CheckoutEvent(
        checkout_id=checkout_id,
        customer_id=customer_id,
        merchant_id=merchant_id,
        created_at=created_at,
        updated_at=updated_at,
        customer_segment=customer_segment,
        product_category=product_category,
        cart_value=cart_value,
        currency=currency,
        payment_method=payment_method,
        payment_status=payment_status,
        failure_reason=failure_reason,
        checkout_stage=checkout_stage,
        attempt_count=attempt_count,
        time_on_checkout_seconds=time_on_checkout_seconds,
        device_type=device_type,
        hour_of_day=hour_of_day,
        previous_successful_orders=previous_successful_orders,
        previous_failed_payments=previous_failed_payments,
        risk_score=risk_score,
        recovery_eligible=recovery_eligible,
        best_recovery_action=best_recovery_action,
        recovery_probability=recovery_probability,
        applied_recovery_action=applied_recovery_action,
        recovered=recovered,
        recovered_amount=recovered_amount,
        recovered_at=recovered_at,
        recovery_horizon_days=recovery_horizon_days,
    )


def generate_checkouts(n: int = 1000, seed: int = 42) -> List[CheckoutEvent]:
    random.seed(seed)
    Faker.seed(seed)
    items = []
    for i in range(n):
        items.append(generate_single(i))
    return items
