# UI Metadata Standard for Payment Providers

This document defines the standard structure for the `metadata` JSON field in the `payment_provider` table. This structure is used by the frontend to dynamically render the appropriate input fields for each payment provider.

## Metadata Structure

The metadata object must contain a `ui_requirements` array. Each element in this array represents a form field.

### Field Definition

| Property | Type | Description |
| :--- | :--- | :--- |
| `db_field` | String | The target field in the `payment_method` table (`account_identifier`, `beneficiary_name`, `identification_number`, `description`). |
| `label` | String | The human-readable label to display in the UI. |
| `type` | String | The input type (`text`, `email`, `number`, `tel`). |
| `placeholder` | String | (Optional) The placeholder text for the input. |
| `required` | Boolean | Whether the field is mandatory. |
| `validation_regex` | String | (Optional) A regex pattern for frontend validation. |

## Examples

### Mobile Payment (e.g., Pago Móvil)
```json
{
  "ui_requirements": [
    {
      "db_field": "account_identifier",
      "label": "Phone Number",
      "type": "tel",
      "placeholder": "+58 412...",
      "required": true
    },
    {
      "db_field": "identification_number",
      "label": "ID Card (V/E-12345678)",
      "type": "text",
      "placeholder": "V-12345678",
      "required": true
    }
  ]
}
```

### Digital Platform (e.g., PayPal)
```json
{
  "ui_requirements": [
    {
      "db_field": "account_identifier",
      "label": "PayPal Email",
      "type": "email",
      "placeholder": "your@email.com",
      "required": true
    },
    {
      "db_field": "beneficiary_name",
      "label": "Full Name",
      "type": "text",
      "placeholder": "John Doe",
      "required": false
    }
  ]
}
```

### Bank Transfer (e.g., Bank of America)
```json
{
  "ui_requirements": [
    {
      "db_field": "account_identifier",
      "label": "Account Number",
      "type": "text",
      "placeholder": "Account / IBAN",
      "required": true
    },
    {
      "db_field": "beneficiary_name",
      "label": "Account Holder",
      "type": "text",
      "placeholder": "Legal Name",
      "required": true
    },
    {
      "db_field": "description",
      "label": "Routing Number / SWIFT",
      "type": "text",
      "placeholder": "0260...",
      "required": false
    }
  ]
}
```
