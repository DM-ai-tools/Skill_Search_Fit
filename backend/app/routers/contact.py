"""Public contact form submissions."""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(..., min_length=10, max_length=5000)


class ContactResponse(BaseModel):
    success: bool
    message: str


@router.post("", response_model=ContactResponse, status_code=201)
async def submit_contact(body: ContactRequest) -> ContactResponse:
    """Accept marketing contact form submissions (logged server-side)."""
    logger.info(
        "Contact form submission from %s <%s>: %s",
        body.name,
        body.email,
        body.message[:200],
    )
    return ContactResponse(
        success=True,
        message="Thanks for your message. We'll get back to you soon.",
    )
