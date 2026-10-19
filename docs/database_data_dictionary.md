# Database Data Dictionary
## Smart Multi-Temple Prasadam Booking Portal (PostgreSQL 16+)

This data dictionary outlines the physical tables, column specifications, constraints, and business intent for the unified database serving both the Devotee Portal and Admin Portal.

---

### Domain 1: Accounts and Permissions

#### Table: `users`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `email` | `VARCHAR(255)` | No | - | Unique, devotee/admin login email |
| `phone_number` | `VARCHAR(20)` | Yes | - | Unique, devotee SMS/WhatsApp delivery |
| `password_hash` | `VARCHAR(255)` | Yes | - | Nullable for OAuth/passwordless OTP users |
| `full_name` | `VARCHAR(128)` | No | - | Display name of devotee or staff member |
| `avatar_url` | `VARCHAR(512)` | Yes | - | Profile picture URL |
| `status` | `UserStatus` | No | `ACTIVE` | Enum: `ACTIVE`, `SUSPENDED`, `DELETED` |
| `is_email_verified` | `BOOLEAN` | No | `false` | Email verification flag |
| `is_phone_verified` | `BOOLEAN` | No | `false` | Mobile OTP verification flag |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Auto-updated UTC timestamp |

#### Table: `roles`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `name` | `VARCHAR(64)` | No | - | Unique (`DEVOTEE`, `COUNTER_STAFF`, `TEMPLE_ADMIN`, `MAIN_ADMIN`, `AUDITOR`) |
| `description` | `VARCHAR(255)` | Yes | - | Human-readable role description |
| `permissions` | `JSONB` | No | `'[]'` | Granular permission string list |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `user_roles`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `role_id` | `UUID` | No | - | FK to `roles(id)` ON DELETE RESTRICT |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE CASCADE. `NULL` for global admins |
| `assigned_by_id` | `UUID` | Yes | - | FK to `users(id)` ON DELETE SET NULL |
| `assigned_at` | `TIMESTAMPTZ` | No | `now()` | UTC assignment timestamp |
*Unique constraint:* `(user_id, role_id, temple_id)`

#### Table: `admin_access_requests`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `target_role_id` | `UUID` | No | - | FK to `roles(id)` ON DELETE RESTRICT |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE CASCADE |
| `justification` | `TEXT` | No | - | Devotee/staff request justification |
| `status` | `ApprovalStatus` | No | `PENDING` | Enum: `PENDING`, `APPROVED`, `REJECTED` |
| `reviewed_by_id` | `UUID` | Yes | - | FK to `users(id)` (Super Admin) |
| `rejection_reason`| `TEXT` | Yes | - | Reason if rejected by Super Admin |
| `reviewed_at` | `TIMESTAMPTZ` | Yes | - | Time decision was taken |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC submission timestamp |

#### Table: `sessions`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `token_hash` | `VARCHAR(128)` | No | - | Unique SHA-256 hash of refresh token |
| `user_agent` | `VARCHAR(512)` | Yes | - | Device browser fingerprint |
| `ip_address` | `VARCHAR(64)` | Yes | - | Client IP |
| `is_revoked` | `BOOLEAN` | No | `false` | True if explicitly invalidated |
| `expires_at` | `TIMESTAMPTZ` | No | - | Expiration timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC creation timestamp |

---

### Domain 2: Temples and Public Content

#### Table: `temples`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `slug` | `VARCHAR(100)` | No | - | Unique URL-friendly slug |
| `name` | `VARCHAR(200)` | No | - | Official temple name |
| `deity` | `VARCHAR(128)` | No | - | Presiding Deity |
| `description` | `TEXT` | No | - | History, timings, rules |
| `contact_email` | `VARCHAR(255)` | No | - | Temple administrative email |
| `contact_phone` | `VARCHAR(32)` | No | - | Helpline phone number |
| `address_line1` | `VARCHAR(255)` | No | - | Physical location address |
| `city` | `VARCHAR(100)` | No | - | City name |
| `state` | `VARCHAR(100)` | No | - | State name |
| `postal_code` | `VARCHAR(20)` | No | - | Postal PIN code |
| `latitude` | `DECIMAL(10,7)` | No | - | GPS coordinate for geofencing |
| `longitude` | `DECIMAL(10,7)` | No | - | GPS coordinate for geofencing |
| `is_active` | `BOOLEAN` | No | `true` | Display flag in devotee portal |
| `is_archived` | `BOOLEAN` | No | `false` | Soft-deletion flag |
| `archived_at` | `TIMESTAMPTZ` | Yes | - | Archival timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Auto-updated UTC timestamp |

#### Table: `media_assets`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE SET NULL |
| `uploaded_by_id`| `UUID` | Yes | - | FK to `users(id)` ON DELETE SET NULL |
| `file_name` | `VARCHAR(255)` | No | - | Stored file name |
| `file_url` | `VARCHAR(1024)`| No | - | Secure Cloud CDN URL |
| `mime_type` | `VARCHAR(100)` | No | - | E.g. `image/webp`, `image/jpeg` |
| `file_size_bytes`| `INTEGER` | No | - | File size in bytes |
| `alt_text` | `VARCHAR(255)` | Yes | - | Accessibility description |
| `asset_type` | `MediaAssetType`| No | `GENERAL` | Enum: `BANNER`, `ITEM_THUMBNAIL`, `CONTAINER_COVER`, `QR_CODE`, `GENERAL` |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC creation timestamp |

#### Table: `containers`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE CASCADE |
| `slug` | `VARCHAR(100)` | No | - | Container slug |
| `title` | `VARCHAR(150)` | No | - | E.g. "Festival Special Sweets" |
| `description` | `TEXT` | Yes | - | Subtitle / promotional text |
| `cover_media_id`| `UUID` | Yes | - | FK to `media_assets(id)` |
| `layout_type` | `ContainerLayout`| No| `GRID` | Enum: `GRID`, `CAROUSEL`, `FEATURED_BANNER`, `LIST` |
| `display_order`| `INTEGER` | No | `0` | Ranking on the temple landing page |
| `is_published` | `BOOLEAN` | No | `true` | Publicly visible to devotees |
| `is_archived` | `BOOLEAN` | No | `false` | Soft-archival flag |
| `published_at` | `TIMESTAMPTZ` | Yes | - | Scheduled publication timestamp |
| `archived_at` | `TIMESTAMPTZ` | Yes | - | Soft-archival timestamp |
*Unique constraint:* `(temple_id, slug)`

#### Table: `prasadam_items`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE CASCADE |
| `slug` | `VARCHAR(100)` | No | - | Product slug |
| `name` | `VARCHAR(200)` | No | - | E.g. "Special Tirupati Laddu" |
| `description` | `TEXT` | No | - | Prasadam description and sacred significance |
| `price` | `DECIMAL(10,2)`| No | - | Catalogue price in INR |
| `ingredients` | `TEXT` | Yes | - | Ingredients list |
| `allergens` | `VARCHAR(255)` | Yes | - | Allergy warnings (nuts, dairy) |
| `shelf_life_hours`| `INTEGER` | No | `24` | Shelf life in hours |
| `is_perishable`| `BOOLEAN` | No | `true` | Whether same-day consumption is required |
| `max_quantity_per_devotee`| `INTEGER` | No | `10` | Booking throttle per slot |
| `preparation_time_minutes`| `INTEGER` | No | `0` | Batch kitchen lead time |
| `thumbnail_media_id`| `UUID` | Yes | - | FK to `media_assets(id)` |
| `display_order`| `INTEGER` | No | `0` | Default catalogue ordering |
| `status` | `PrasadamStatus`| No | `AVAILABLE` | Enum: `AVAILABLE`, `SOLD_OUT`, `DISCONTINUED`, `ARCHIVED` |
*Unique constraint:* `(temple_id, slug)`

#### Table: `container_items`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `container_id` | `UUID` | No | - | FK to `containers(id)` ON DELETE CASCADE |
| `prasadam_item_id`| `UUID` | No | - | FK to `prasadam_items(id)` ON DELETE CASCADE |
| `display_order`| `INTEGER` | No | `0` | Ordering within the container carousel/grid |
| `is_highlighted`| `BOOLEAN` | No | `false` | Highlight/badge in UI |
| `added_at` | `TIMESTAMPTZ` | No | `now()` | UTC addition timestamp |
*Unique constraint:* `(container_id, prasadam_item_id)`

---

### Domain 3: Inventory and Real-Time Stock Protection

#### Table: `inventory`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `prasadam_item_id`| `UUID` | No | - | Unique FK to `prasadam_items(id)` ON DELETE CASCADE |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE CASCADE |
| `quantity_available`| `INTEGER` | No | `0` | Unreserved physical stock (`CHECK >= 0`) |
| `quantity_reserved`| `INTEGER` | No | `0` | Stock held in active checkouts (`CHECK >= 0`) |
| `low_stock_threshold`| `INTEGER` | No | `10` | Threshold alerting temple staff |
| `safety_buffer` | `INTEGER` | No | `0` | Buffer held back from online sales |
| `is_unlimited` | `BOOLEAN` | No | `false` | Flag for made-to-order offerings |
| `lock_version` | `INTEGER` | No | `0` | Optimistic locking counter |
| `last_restocked_at`| `TIMESTAMPTZ`| Yes| - | Restock timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `inventory_movements`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `inventory_id` | `UUID` | No | - | FK to `inventory(id)` ON DELETE CASCADE |
| `movement_type` | `MovementType`| No | - | Enum: `RESTOCK`, `RESERVATION_HOLD`, `RESERVATION_RELEASE`, `ORDER_FULFILLMENT`, `SPOILAGE_WASTE`, `AUDIT_ADJUSTMENT` |
| `quantity_change`| `INTEGER` | No | - | Delta quantity (+/-) |
| `quantity_before`| `INTEGER` | No | - | Stock before movement |
| `quantity_after` | `INTEGER` | No | - | Stock after movement |
| `reference_type`| `VARCHAR(64)` | Yes | - | `BOOKING`, `RESTOCK_BATCH`, `MANUAL` |
| `reference_id` | `VARCHAR(64)` | Yes | - | Target booking ID or batch tracking code |
| `notes` | `TEXT` | Yes | - | Reason for discrepancy/adjustment |
| `initiated_by_id`| `UUID` | Yes | - | FK to `users(id)` (Staff member) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `inventory_reservations`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `inventory_id` | `UUID` | No | - | FK to `inventory(id)` ON DELETE CASCADE |
| `booking_id` | `UUID` | No | - | FK to `bookings(id)` ON DELETE CASCADE |
| `quantity` | `INTEGER` | No | - | Locked quantity during checkout |
| `status` | `ReservationStatus`| No | `ACTIVE` | Enum: `ACTIVE`, `COMMITTED`, `RELEASED_EXPIRED`, `CANCELLED` |
| `expires_at` | `TIMESTAMPTZ` | No | - | Expiration timestamp (e.g. +10 mins) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

---

### Domain 4: Booking, Payment, QR Verification, and Pickup

#### Table: `pickup_counters`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE CASCADE |
| `counter_number`| `VARCHAR(50)` | No | - | E.g. "CTR-01", "VIP-A" |
| `name` | `VARCHAR(100)` | No | - | E.g. "North Gopuram Counter 1" |
| `location_description`| `VARCHAR(255)`| Yes| - | Physical landmarks for devotees |
| `is_active` | `BOOLEAN` | No | `true` | Active status |
*Unique constraint:* `(temple_id, counter_number)`

#### Table: `pickup_slots`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE CASCADE |
| `counter_id` | `UUID` | No | - | FK to `pickup_counters(id)` ON DELETE CASCADE |
| `slot_date` | `DATE` | No | - | Date of pickup |
| `start_time` | `TIME` | No | - | Slot window start time |
| `end_time` | `TIME` | No | - | Slot window end time |
| `capacity` | `INTEGER` | No | - | Maximum simultaneous bookings |
| `booked_count` | `INTEGER` | No | `0` | Allocated count (`CHECK <= capacity`) |
| `is_active` | `BOOLEAN` | No | `true` | Operational status |
*Unique constraint:* `(counter_id, slot_date, start_time, end_time)`

#### Table: `bookings`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `booking_reference`| `VARCHAR(32)`| No | - | Unique reference (e.g. `BK-20261019-XXXX`) |
| `devotee_id` | `UUID` | No | - | FK to `users(id)` ON DELETE RESTRICT |
| `temple_id` | `UUID` | No | - | FK to `temples(id)` ON DELETE RESTRICT |
| `pickup_slot_id`| `UUID` | No | - | FK to `pickup_slots(id)` ON DELETE RESTRICT |
| `pickup_counter_id`| `UUID` | No | - | FK to `pickup_counters(id)` ON DELETE RESTRICT |
| `status` | `BookingStatus`| No | `DRAFT` | Enum: `DRAFT`, `PENDING_PAYMENT`, `CONFIRMED`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `EXPIRED` |
| `total_amount` | `DECIMAL(10,2)`| No | - | Total order sum in INR |
| `devotee_name_snapshot`| `VARCHAR(128)`| No | - | Name at time of order |
| `devotee_phone_snapshot`| `VARCHAR(32)`| No | - | Phone at time of order |
| `special_instructions`| `TEXT` | Yes | - | Notes for counter staff |
| `cancellation_reason` | `TEXT` | Yes | - | Reason if cancelled |
| `cancellation_requested_at`| `TIMESTAMPTZ`| Yes | - | Timestamp when cancel was requested |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC booking creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | UTC booking update timestamp |

#### Table: `booking_items`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `booking_id` | `UUID` | No | - | FK to `bookings(id)` ON DELETE CASCADE |
| `prasadam_item_id`| `UUID` | No | - | FK to `prasadam_items(id)` ON DELETE RESTRICT |
| `item_name_snapshot`| `VARCHAR(200)`| No | - | Immutable item name at booking time |
| `item_sku_snapshot` | `VARCHAR(64)` | Yes | - | Immutable SKU at booking time |
| `unit_price_snapshot`| `DECIMAL(10,2)`| No | - | Immutable unit price at booking time |
| `quantity` | `INTEGER` | No | - | Quantity booked |
| `line_total` | `DECIMAL(10,2)`| No | - | Subtotal (`quantity * unit_price_snapshot`) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `booking_reschedules`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `booking_id` | `UUID` | No | - | FK to `bookings(id)` ON DELETE CASCADE |
| `previous_slot_id`| `UUID` | No | - | FK to `pickup_slots(id)` ON DELETE RESTRICT |
| `new_slot_id` | `UUID` | No | - | FK to `pickup_slots(id)` ON DELETE RESTRICT |
| `reason` | `TEXT` | Yes | - | Justification for rescheduling |
| `requested_by_id`| `UUID` | No | - | FK to `users(id)` (Devotee or Admin) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `payments`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `booking_id` | `UUID` | No | - | FK to `bookings(id)` ON DELETE RESTRICT |
| `idempotency_key`| `VARCHAR(128)`| No | - | Unique idempotency key (gateway event ID) |
| `gateway` | `PaymentGateway`| No | - | Enum: `RAZORPAY`, `STRIPE`, `UPI_INTENT`, `MANUAL_VERIFIED` |
| `gateway_order_id`| `VARCHAR(128)`| Yes| - | Order ID returned by payment gateway |
| `gateway_payment_id`| `VARCHAR(128)`| Yes| - | Payment transaction ID |
| `gateway_signature`| `VARCHAR(255)`| Yes| - | Cryptographic webhook signature |
| `amount` | `DECIMAL(10,2)`| No | - | Charged amount |
| `currency` | `VARCHAR(10)` | No | `'INR'` | ISO 4217 currency code |
| `status` | `PaymentStatus`| No | `PENDING` | Enum: `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED` |
| `gateway_response_payload`| `JSONB`| Yes| - | Full audit response from payment gateway |
| `paid_at` | `TIMESTAMPTZ` | Yes | - | Timestamp gateway confirmed payment |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `refunds`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `payment_id` | `UUID` | No | - | FK to `payments(id)` ON DELETE RESTRICT |
| `gateway_refund_id`| `VARCHAR(128)`| Yes| - | Unique refund ID from gateway |
| `amount` | `DECIMAL(10,2)`| No | - | Refunded amount |
| `reason` | `TEXT` | No | - | Customer care / cancellation reason |
| `status` | `RefundStatus` | No | `INITIATED` | Enum: `INITIATED`, `PROCESSING`, `SUCCESS`, `FAILED` |
| `processed_at` | `TIMESTAMPTZ` | Yes | - | Settlement timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `qr_tokens`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `booking_id` | `UUID` | No | - | Unique FK to `bookings(id)` ON DELETE CASCADE |
| `token_hash` | `VARCHAR(128)`| No | - | Unique SHA-256 hash of token + salt |
| `salt` | `VARCHAR(64)` | No | - | Cryptographic salt |
| `short_code` | `VARCHAR(16)` | No | - | Human-readable 6-8 character code |
| `status` | `QrStatus` | No | `ISSUED` | Enum: `ISSUED`, `SCANNED`, `EXPIRED`, `REVOKED` |
| `expires_at` | `TIMESTAMPTZ` | No | - | Expiration boundary (slot end time + buffer) |
| `scanned_at` | `TIMESTAMPTZ` | Yes | - | Precise scan timestamp |
| `scanned_by_id`| `UUID` | Yes | - | FK to `users(id)` (Staff member who scanned) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

---

### Domain 5: Location, Notifications, and Customer Care

#### Table: `location_requests`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `purpose` | `LocationPurpose`| No | - | Enum: `GEOFENCE_PICKUP_CHECK`, `NEARBY_TEMPLE_DISCOVERY` |
| `latitude` | `DECIMAL(10,7)`| No | - | User latitude |
| `longitude` | `DECIMAL(10,7)`| No | - | User longitude |
| `accuracy_meters`| `DECIMAL(8,2)` | Yes | - | GPS accuracy circle |
| `is_within_geofence`| `BOOLEAN` | No | `false` | Geofence verification flag |
| `ip_address` | `VARCHAR(64)` | Yes | - | Request IP |
| `requested_at` | `TIMESTAMPTZ` | No | `now()` | Timestamp of location check |
| `expires_at` | `TIMESTAMPTZ` | No | - | Ephemeral cleanup TTL |

#### Table: `notifications`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE SET NULL |
| `title` | `VARCHAR(200)` | No | - | Notification title |
| `message` | `TEXT` | No | - | Message body |
| `channel` | `NotificationChannel`| No| `IN_APP` | Enum: `IN_APP`, `SMS`, `WHATSAPP`, `EMAIL` |
| `notification_type`| `NotificationType`| No| - | Enum: `BOOKING_CONFIRMATION`, `PICKUP_REMINDER`, `ADMIN_APPROVAL`, `STOCK_ALERT`, `SUPPORT_UPDATE`, `PAYMENT_RECEIPT` |
| `is_read` | `BOOLEAN` | No | `false` | Devotee read status |
| `metadata` | `JSONB` | Yes | - | Deep links, booking references |
| `sent_at` | `TIMESTAMPTZ` | No | `now()` | Dispatch timestamp |
| `read_at` | `TIMESTAMPTZ` | Yes | - | Read receipt timestamp |

#### Table: `support_tickets`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `ticket_number` | `VARCHAR(32)` | No | - | Unique ticket reference (e.g. `TCK-20261019-XXXX`) |
| `devotee_id` | `UUID` | No | - | FK to `users(id)` ON DELETE RESTRICT |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE SET NULL |
| `booking_id` | `UUID` | Yes | - | FK to `bookings(id)` ON DELETE SET NULL |
| `subject` | `VARCHAR(255)` | No | - | Ticket subject headline |
| `category` | `TicketCategory`| No | `GENERAL` | Enum: `BOOKING`, `PAYMENT`, `PRASADAM_QUALITY`, `PICKUP_ISSUE`, `GENERAL` |
| `priority` | `TicketPriority`| No | `MEDIUM` | Enum: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `status` | `TicketStatus` | No | `OPEN` | Enum: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED` |
| `assigned_to_id`| `UUID` | Yes | - | FK to `users(id)` (Customer care staff) |
| `resolved_at` | `TIMESTAMPTZ` | Yes | - | Resolution timestamp |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC ticket creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Auto-updated UTC timestamp |

#### Table: `support_messages`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `ticket_id` | `UUID` | No | - | FK to `support_tickets(id)` ON DELETE CASCADE |
| `sender_id` | `UUID` | No | - | FK to `users(id)` ON DELETE RESTRICT |
| `is_staff` | `BOOLEAN` | No | `false` | True if sent by admin/support staff |
| `message_text` | `TEXT` | No | - | Message conversation text |
| `attachment_media_id`| `UUID` | Yes | - | FK to `media_assets(id)` |
| `is_internal_note`| `BOOLEAN` | No | `false` | Hidden from devotee if true |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

---

### Domain 6: AI Assistant, Audit Trails, and System Settings

#### Table: `ai_conversations`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | - | FK to `users(id)` ON DELETE CASCADE |
| `temple_id` | `UUID` | Yes | - | FK to `temples(id)` ON DELETE SET NULL |
| `session_token`| `VARCHAR(128)`| Yes | - | Ephemeral web chat session token |
| `status` | `AiConversationStatus`| No | `ACTIVE` | Enum: `ACTIVE`, `ARCHIVED`, `EXPIRED` |
| `expires_at` | `TIMESTAMPTZ` | No | - | Purge boundary (30 days retention policy) |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `ai_messages`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `conversation_id`| `UUID` | No | - | FK to `ai_conversations(id)` ON DELETE CASCADE |
| `role` | `AiMessageRole`| No | - | Enum: `USER`, `ASSISTANT`, `SYSTEM` |
| `content` | `TEXT` | No | - | Chat message text (PII strictly excluded) |
| `tokens_used` | `INTEGER` | Yes | - | Token metric for billing audit |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | UTC timestamp |

#### Table: `audit_logs`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `actor_id` | `UUID` | Yes | - | FK to `users(id)` ON DELETE SET NULL (`NULL` for automated worker) |
| `actor_role` | `VARCHAR(64)` | No | - | Role at time of action |
| `action` | `VARCHAR(64)` | No | - | E.g. `ADMIN_APPROVAL`, `PRICE_UPDATE`, `SCAN_QR`, `REFUND` |
| `entity_name` | `VARCHAR(64)` | No | - | E.g. `bookings`, `prasadam_items`, `users` |
| `entity_id` | `UUID` | Yes | - | Primary key of modified entity |
| `previous_state`| `JSONB` | Yes | - | JSON snapshot prior to mutation |
| `new_state` | `JSONB` | Yes | - | JSON snapshot after mutation |
| `ip_address` | `VARCHAR(64)` | Yes | - | Client IP |
| `user_agent` | `VARCHAR(512)` | Yes | - | Client browser / device |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Immutable UTC audit timestamp |

#### Table: `system_settings`
| Column | Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `key` | `VARCHAR(128)` | No | - | Unique configuration key |
| `value` | `JSONB` | No | - | Structured configuration JSON |
| `description` | `VARCHAR(255)` | Yes | - | Administrative description |
| `is_public` | `BOOLEAN` | No | `false` | True if exposed to devotee portal |
| `updated_by_id`| `UUID` | Yes | - | FK to `users(id)` ON DELETE SET NULL |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Auto-updated UTC timestamp |
