import { queryDb } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { Array as A, Effect, Layer } from "effect";

import { tables } from "../../../livestore/schema";
import type { schema } from "../../../livestore/schema";
import { LinkId, TagId } from "../../db/branded";
import type { DigestSourceData } from "../build-digest-links";
import { buildDigestLinks } from "../build-digest-links";
import { digestLinkSourceErrorFromUnknown } from "../errors";
import { DigestLinkSource } from "../services";

const collectSourceData = (store: Store<typeof schema>): DigestSourceData => ({
  linkTags: A.map(store.query(queryDb(tables.linkTags.where({}))), (lt) => ({
    linkId: LinkId.make(lt.linkId),
    tagId: TagId.make(lt.tagId),
  })),
  links: A.map(
    store.query(queryDb(tables.links.where({ deletedAt: null }))),
    (l) => ({
      createdAt: l.createdAt,
      domain: l.domain,
      id: LinkId.make(l.id),
      url: l.url,
    })
  ),
  snapshots: A.map(
    store.query(queryDb(tables.linkSnapshots.where({}))),
    (s) => ({
      fetchedAt: s.fetchedAt,
      linkId: LinkId.make(s.linkId),
      title: s.title,
    })
  ),
  summaries: A.map(
    store.query(queryDb(tables.linkSummaries.where({}))),
    (s) => ({
      linkId: LinkId.make(s.linkId),
      summarizedAt: s.summarizedAt,
      summary: s.summary,
    })
  ),
  tags: A.map(
    store.query(queryDb(tables.tags.where({ deletedAt: null }))),
    (t) => ({ id: TagId.make(t.id), name: t.name })
  ),
});

export const DigestLinkSourceLive = (store: Store<typeof schema>) =>
  Layer.succeed(DigestLinkSource, {
    collect: (cutoffMs) =>
      Effect.try({
        catch: digestLinkSourceErrorFromUnknown,
        try: () => buildDigestLinks(collectSourceData(store), cutoffMs),
      }),
  });
