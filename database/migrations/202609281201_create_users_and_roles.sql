-- Users (P1-02). Only the admin creates users (D-004, D-033); any email
-- domain is allowed. Users are made inactive, never deleted, so history and
-- the append-only audit log stay intact (D-012, D-033).
CREATE TABLE users (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login_id              VARCHAR(100)     NOT NULL COMMENT 'User ID for password sign-in; also a readable handle',
  name                  VARCHAR(200)     NOT NULL,
  email                 VARCHAR(255)     NOT NULL COMMENT 'any domain (D-004); must match Google email for Google sign-in',
  whatsapp_number       VARCHAR(20)      NULL COMMENT 'digits only incl. country code; OTP + notifications (D-025)',
  department_id         BIGINT UNSIGNED  NULL,
  designation_id        BIGINT UNSIGNED  NULL,
  reporting_manager_id  BIGINT UNSIGNED  NULL,
  sign_in_method        ENUM('GOOGLE', 'PASSWORD') NOT NULL DEFAULT 'GOOGLE',
  firebase_uid          VARCHAR(128)     NULL COMMENT 'linked on first Google sign-in only',
  password_hash         VARCHAR(255)     NULL COMMENT 'scrypt; NULL until the user sets a password',
  password_set_at       DATETIME         NULL,
  failed_login_count    INT UNSIGNED     NOT NULL DEFAULT 0,
  locked_until          DATETIME         NULL,
  active                BOOLEAN          NOT NULL DEFAULT TRUE,
  is_break_glass        BOOLEAN          NOT NULL DEFAULT FALSE COMMENT 'D-011: sealed emergency admin, disabled by default',
  break_glass_until     DATETIME         NULL COMMENT 'break-glass sign-in allowed only before this time',
  last_login_at         DATETIME         NULL,
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by            BIGINT UNSIGNED  NULL,
  updated_by            BIGINT UNSIGNED  NULL,
  CONSTRAINT uq_users_login_id UNIQUE (login_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_whatsapp_number UNIQUE (whatsapp_number),
  CONSTRAINT uq_users_firebase_uid UNIQUE (firebase_uid),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_users_designation FOREIGN KEY (designation_id) REFERENCES designations(id),
  CONSTRAINT fk_users_manager FOREIGN KEY (reporting_manager_id) REFERENCES users(id),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  INDEX idx_users_department (department_id),
  INDEX idx_users_manager (reporting_manager_id),
  INDEX idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE departments
  ADD COLUMN hod_user_id BIGINT UNSIGNED NULL AFTER name,
  ADD CONSTRAINT fk_departments_hod FOREIGN KEY (hod_user_id) REFERENCES users(id);

-- Roles are assigned per user, by the admin only (D-033). A user may hold
-- several. System roles: SUPER_ADMIN (/superadmin, everything), IT_ADMIN
-- (/admin), USER (/users). More roles can be added later for approver
-- sources ("any user with role Finance HOD").
CREATE TABLE roles (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(50)      NOT NULL,
  name         VARCHAR(100)     NOT NULL,
  description  VARCHAR(500)     NULL,
  is_system    BOOLEAN          NOT NULL DEFAULT FALSE,
  active       BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  user_id      BIGINT UNSIGNED NOT NULL,
  role_id      BIGINT UNSIGNED NOT NULL,
  assigned_by  BIGINT UNSIGNED NULL,
  assigned_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
