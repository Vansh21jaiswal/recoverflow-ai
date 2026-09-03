import random
from app.models.checkout import CheckoutEvent
from app.schemas.execution import GuardrailResult

def simulate_execution(checkout: CheckoutEvent, guardrail_result: GuardrailResult, confidence: float):
    """
    Simulates a realistic execution outcome.
    Returns: (outcome: str, recovered_amount: float)
    """
    if not guardrail_result.allowed:
        if guardrail_result.review_required:
            return "requires_review", 0.0
        return "stopped_by_policy", 0.0
        
    action = guardrail_result.action
    if action == "no_action":
        return "failed", 0.0

    # Use confidence as the base probability of success
    # Add a slight random noise for variability
    base_prob = min(0.85, confidence)
    
    # Adjust based on action type to simulate realistic behavior
    if action == "offer_limited_discount":
        base_prob += 0.10
    elif action == "escalate_for_review":
        return "pending", 0.0

    rand_val = random.random()
    
    success_threshold = base_prob
    pending_threshold = success_threshold + 0.10
    no_response_threshold = pending_threshold + 0.15
    
    outcome = "failed"
    if rand_val <= success_threshold:
        outcome = "recovered"
    elif rand_val <= pending_threshold:
        outcome = "pending"
    elif rand_val <= no_response_threshold:
        outcome = "no_response"
        
    recovered_amount = 0.0
    if outcome == "recovered":
        # Simulate recovered amount
        if action == "offer_limited_discount":
            # Simulate a 10-15% discount
            discount = random.uniform(0.10, 0.15)
            recovered_amount = round((checkout.cart_value or 0.0) * (1.0 - discount), 2)
        else:
            recovered_amount = float(checkout.cart_value or 0.0)
            
        # Safety constraint: never greater than original
        recovered_amount = min(recovered_amount, float(checkout.cart_value or 0.0))
        
    return outcome, recovered_amount
