import test from "ava"
import { getTestFixture } from "tests/fixtures/get-test-fixture"
import { su } from "@tscircuit/soup-util"

test("sod123", async (t) => {
  const { fp, logSoup, snapshotSoup } = await getTestFixture(t)
  const soup = fp.string("sod123").soup()

  snapshotSoup(soup)
  t.pass()
})
