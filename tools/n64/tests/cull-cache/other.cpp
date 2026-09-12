#include "fake-gl.h"
void initializeContext() { RiceTrackedDisable(GL_CULL_FACE); }
void spriteRoundTrip() {
    const auto before = glIsEnabled(GL_CULL_FACE);
    RiceTrackedDisable(GL_CULL_FACE);
    if (before) RiceTrackedEnable(GL_CULL_FACE);
}