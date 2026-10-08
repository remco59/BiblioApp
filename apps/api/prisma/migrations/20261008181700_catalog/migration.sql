-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "seriesId" INTEGER,
ADD COLUMN     "seriesNumber" INTEGER;

-- CreateTable
CREATE TABLE "Series" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookTag" (
    "bookId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "BookTag_pkey" PRIMARY KEY ("bookId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_name_key" ON "Series"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Zoeken: fuzzy (trigram) en full-text (Nederlands)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Book_title_trgm_idx" ON "Book" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Author_name_trgm_idx" ON "Author" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Book_fts_idx" ON "Book" USING GIN (to_tsvector('dutch', "title" || ' ' || coalesce("description", '')));
