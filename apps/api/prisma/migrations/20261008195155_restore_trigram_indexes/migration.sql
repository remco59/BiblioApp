-- CreateIndex
CREATE INDEX "Author_name_trgm_idx" ON "Author" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Book_title_trgm_idx" ON "Book" USING GIN ("title" gin_trgm_ops);
