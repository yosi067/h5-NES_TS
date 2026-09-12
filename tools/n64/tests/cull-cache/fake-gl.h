#pragma once
using GLenum = unsigned int;
using GLboolean = unsigned char;
constexpr GLenum GL_CULL_FACE = 0x0B44;
constexpr GLboolean GL_FALSE = 0;
constexpr GLboolean GL_TRUE = 1;
extern bool selected;
extern GLboolean actual;
extern int queries, writes;
void glEnable(GLenum cap);
void glDisable(GLenum cap);
GLboolean glIsEnabled(GLenum cap);
#include "RiceCullCache.h"