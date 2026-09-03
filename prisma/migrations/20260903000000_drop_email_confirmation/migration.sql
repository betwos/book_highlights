-- Remove email confirmation. Registration now creates an account that can sign
-- in immediately, so neither the issued codes nor the "this address was proven"
-- flag has a reader left in the application.
--
-- Destructive by nature: the codes table and the confirmation timestamps both
-- go. Nothing reads them once `authorize` stops consulting `emailVerified` —
-- but note that an account previously stranded unconfirmed becomes able to sign
-- in, because the condition that was holding it back no longer exists.

-- DropTable
DROP TABLE "VerificationCode";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "emailVerified";
