from urllib.parse import urlparse

from app.exceptions import validation_error


def validate_plugin_inputs(input_fields: list, inputs: dict) -> None:
    errors: list[dict] = []

    for field in input_fields:
        name = field.get("name")
        if not name:
            continue

        value = inputs.get(name)
        required = field.get("required", False)
        field_type = field.get("type", "text")

        if required and (value is None or value == ""):
            errors.append({"field": name, "message": f"{field.get('label', name)} is required"})
            continue

        if value is None or value == "":
            continue

        if field_type == "number":
            try:
                float(value)
            except (TypeError, ValueError):
                errors.append({"field": name, "message": "Must be a number"})

        if field_type == "url":
            parsed = urlparse(str(value))
            if not parsed.scheme or not parsed.netloc:
                errors.append({"field": name, "message": "Must be a valid URL"})

        if field_type == "select":
            options = field.get("options", [])
            allowed = {o.get("value") for o in options}
            if str(value) not in allowed:
                errors.append({"field": name, "message": "Invalid selection"})

        if field_type == "checkbox" and not isinstance(value, bool):
            errors.append({"field": name, "message": "Must be true or false"})

    if errors:
        raise validation_error("Input validation failed", errors)


def collect_plugin_input_errors(input_fields: list, inputs: dict) -> list[dict]:
    """Return validation errors without raising — used by autofill QA."""
    errors: list[dict] = []

    for field in input_fields:
        name = field.get("name")
        if not name:
            continue

        value = inputs.get(name)
        required = field.get("required", False)
        field_type = field.get("type", "text")

        if required and (value is None or value == ""):
            errors.append({"field": name, "message": f"{field.get('label', name)} is required"})
            continue

        if value is None or value == "":
            continue

        if field_type == "number":
            try:
                float(value)
            except (TypeError, ValueError):
                errors.append({"field": name, "message": "Must be a number"})

        if field_type == "url":
            parsed = urlparse(str(value))
            if not parsed.scheme or not parsed.netloc:
                errors.append({"field": name, "message": "Must be a valid URL"})

        if field_type == "select":
            options = field.get("options", [])
            allowed = {o.get("value") for o in options}
            if str(value) not in allowed:
                errors.append({"field": name, "message": "Invalid selection"})

        if field_type == "checkbox" and not isinstance(value, bool):
            errors.append({"field": name, "message": "Must be true or false"})

    return errors
