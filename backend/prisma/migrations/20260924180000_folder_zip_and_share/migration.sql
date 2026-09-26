-- Allow a FileShare row to point at either a File OR a Folder.
-- fileId becomes nullable; a new nullable folderId is added.
-- Application code (shareService.ts) enforces "exactly one is set" -
-- Postgres doesn't have a portable, simple way to express that as a
-- single CHECK across two nullable FK columns alongside Prisma's
-- migration model, so it's validated at the service layer instead.

ALTER TABLE "FileShare" ALTER COLUMN "fileId" DROP NOT NULL;

ALTER TABLE "FileShare" ADD COLUMN "folderId" TEXT;

CREATE INDEX "FileShare_folderId_idx" ON "FileShare"("folderId");

ALTER TABLE "FileShare"
  ADD CONSTRAINT "FileShare_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
