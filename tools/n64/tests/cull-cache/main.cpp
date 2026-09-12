#include <cassert>
#include <cstdio>
#include <initializer_list>
#include "fake-gl.h"
bool selected;
GLboolean actual = GL_TRUE;
int queries = 0, writes = 0;
void glEnable(GLenum cap) { ++writes; if (cap == GL_CULL_FACE) actual = GL_TRUE; }
void glDisable(GLenum cap) { ++writes; if (cap == GL_CULL_FACE) actual = GL_FALSE; }
GLboolean glIsEnabled(GLenum cap) { ++queries; return cap == GL_CULL_FACE ? actual : GL_TRUE; }
void initializeContext();
void spriteRoundTrip();
int main(int argc, char **) {
    selected = argc > 1;
    // Unknown cache must query rather than invent a default.
    assert(RiceCachedIsEnabled(GL_CULL_FACE) == GL_TRUE);
    assert(queries == 1);
    assert(RiceCachedIsEnabled(GL_CULL_FACE) == GL_TRUE);
    assert(queries == (selected ? 1 : 2));
    initializeContext(); // A different translation unit seeds the shared state.
    assert(RiceCachedIsEnabled(GL_CULL_FACE) == GL_FALSE);
    for (bool enabled : {false, true}) {
        if (enabled) RiceTrackedEnable(GL_CULL_FACE);
        else RiceTrackedDisable(GL_CULL_FACE);
        const auto old = RiceCachedIsEnabled(GL_CULL_FACE);
        RiceTrackedDisable(GL_CULL_FACE);
        if (old) RiceTrackedEnable(GL_CULL_FACE);
        assert(actual == enabled);
        spriteRoundTrip();
        assert(RiceCachedIsEnabled(GL_CULL_FACE) == enabled);
    }
    RiceTrackedEnable(GL_CULL_FACE);
    assert(RiceCachedIsEnabled(GL_CULL_FACE) == GL_TRUE);
    initializeContext(); // Reinitialization must replace a known enabled state.
    assert(RiceCachedIsEnabled(GL_CULL_FACE) == GL_FALSE);
    const auto before = queries;
    assert(RiceCachedIsEnabled(123) == GL_TRUE);
    assert(queries == before + 1); // Other capabilities always use real queries.
    const auto oldWrites = writes;
    RiceTrackedDisable(GL_CULL_FACE);
    RiceTrackedDisable(GL_CULL_FACE);
    assert(writes == oldWrites + 2); // Never elide even redundant GL writes.
    std::printf("cull cache %s: passed, queries=%d writes=%d\n", selected ? "on" : "off", queries, writes);
}