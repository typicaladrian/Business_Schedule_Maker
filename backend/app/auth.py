import os
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select
from app.database import get_session
from app.schema import Manager, Branch

load_dotenv()

# The Clerk instance's Frontend API URL (e.g. https://your-app.clerk.accounts.dev)
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").rstrip("/")

if not CLERK_ISSUER:
    raise ValueError("CLERK_ISSUER environment variable is missing!")

# Only these sites may call the API (used for CORS and for the token's azp claim)
ALLOWED_ORIGINS = [
    "https://aischeduler.typicaladrian.dev",
    "http://localhost:3000",
]

# Clerk signs session tokens with RS256. The public keys are fetched once and cached.
jwks_client = jwt.PyJWKClient(f"{CLERK_ISSUER}/.well-known/jwks.json")

bearer_scheme = HTTPBearer(auto_error=False)


def get_clerk_user_id(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> str:
    """Verifies the Clerk session token and returns the signed-in user's Clerk ID."""
    unauthorized = HTTPException(
        status_code=401,
        detail="Invalid or missing session token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            leeway=5,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )
    except jwt.PyJWTError:
        raise unauthorized

    # azp is the origin the token was issued to. Reject tokens minted for any other site.
    authorized_party = claims.get("azp")
    if authorized_party and authorized_party not in ALLOWED_ORIGINS:
        raise unauthorized

    return claims["sub"]


def get_current_manager(
    clerk_user_id: str = Depends(get_clerk_user_id),
    session: Session = Depends(get_session),
) -> Manager:
    """Looks up the manager record that belongs to the verified Clerk user."""
    manager = session.exec(select(Manager).where(Manager.clerk_id == clerk_user_id)).first()
    if not manager:
        raise HTTPException(status_code=403, detail="Manager account has not been synced.")
    return manager


def require_branch_owner(session: Session, branch_id: int, manager: Manager) -> Branch:
    """Returns the branch only if the manager owns it. Other managers' branches look like they don't exist."""
    branch = session.get(Branch, branch_id)
    if not branch or branch.manager_id != manager.id:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch


def get_owned_branch(
    branch_id: int,
    manager: Manager = Depends(get_current_manager),
    session: Session = Depends(get_session),
) -> Branch:
    """Dependency version of require_branch_owner for routes with a {branch_id} path parameter."""
    return require_branch_owner(session, branch_id, manager)
