from models.subscription import SubscriptionStatus

# Entitled statuses: active billing, or past_due during Stripe's retry/grace window.
# cancel_at_period_end stays ACTIVE until Stripe sends customer.subscription.deleted.
PRO_SUBSCRIPTION_STATUSES = frozenset({
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
})


def subscription_grants_pro(subscription) -> bool:
    """True if this subscription row currently grants Pro access."""
    if subscription is None:
        return False
    status = subscription.status
    if isinstance(status, SubscriptionStatus):
        return status in PRO_SUBSCRIPTION_STATUSES
    try:
        return SubscriptionStatus(str(status).lower()) in PRO_SUBSCRIPTION_STATUSES
    except ValueError:
        return False
