-- Remove Mailchimp from CMS destinations and integration platforms

UPDATE suggestion_changes SET destination = 'WordPress' WHERE destination = 'Mailchimp';
DELETE FROM user_integrations WHERE platform = 'Mailchimp';

ALTER TYPE change_destination RENAME TO change_destination_old;
CREATE TYPE change_destination AS ENUM ('WordPress', 'Webflow', 'Wix');
ALTER TABLE suggestion_changes
    ALTER COLUMN destination TYPE change_destination
    USING destination::text::change_destination;
ALTER TABLE publish_audit_log
    ALTER COLUMN destination TYPE change_destination
    USING destination::text::change_destination;
DROP TYPE change_destination_old;

ALTER TYPE integration_platform RENAME TO integration_platform_old;
CREATE TYPE integration_platform AS ENUM ('WordPress', 'Shopify', 'Webflow', 'Wix', 'Squarespace');
ALTER TABLE user_integrations
    ALTER COLUMN platform TYPE integration_platform
    USING platform::text::integration_platform;
ALTER TABLE integration_audit_log
    ALTER COLUMN platform TYPE integration_platform
    USING platform::text::integration_platform;
DROP TYPE integration_platform_old;
