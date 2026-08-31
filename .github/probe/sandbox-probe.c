/*
 * Reports whether this kernel can enforce the two sandbox mechanisms aube's
 * build jail relies on, and distinguishes "absent" from "present but switched
 * off" — a distinction CONFIG_SECURITY_LANDLOCK alone does not answer, because
 * Landlock must also appear in the boot-time lsm= stack to be usable.
 *
 * Prints a line per mechanism and exits non-zero if either is unusable.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/syscall.h>

/* Both added to the generic syscall table, so the number is arch-independent
 * on x86_64 and aarch64. Defined here because the libc headers on older images
 * predate them. */
#ifndef __NR_landlock_create_ruleset
#define __NR_landlock_create_ruleset 444
#endif
#ifndef __NR_seccomp
#define __NR_seccomp 317
#endif

#define LANDLOCK_CREATE_RULESET_VERSION (1U << 0)
#define SECCOMP_SET_MODE_FILTER 1

static int probe_landlock(void)
{
	/* A NULL attr with the VERSION flag is the documented ABI query: it
	 * reports the supported version without creating a ruleset. */
	long abi = syscall(__NR_landlock_create_ruleset, NULL, (size_t)0,
			   LANDLOCK_CREATE_RULESET_VERSION);

	if (abi >= 0) {
		printf("landlock : USABLE (ABI v%ld)\n", abi);
		return 0;
	}

	switch (errno) {
	case ENOSYS:
		printf("landlock : ABSENT (ENOSYS) — not built into this kernel\n");
		break;
	case EOPNOTSUPP:
		printf("landlock : OFF (EOPNOTSUPP) — built in, missing from the boot lsm= stack\n");
		break;
	default:
		printf("landlock : FAILED (errno %d: %s)\n", errno, strerror(errno));
	}
	return 1;
}

static int probe_seccomp(void)
{
	/* A NULL filter pointer that reaches the copy from user space returns
	 * EFAULT, which means filter mode itself is available. Anything else
	 * means the mode was rejected before the argument was ever read. */
	syscall(__NR_seccomp, SECCOMP_SET_MODE_FILTER, 0, NULL);

	if (errno == EFAULT) {
		printf("seccomp  : USABLE (filter mode accepted)\n");
		return 0;
	}

	printf("seccomp  : UNUSABLE (errno %d: %s)\n", errno, strerror(errno));
	return 1;
}

int main(void)
{
	int failed = 0;

	failed |= probe_landlock();
	failed |= probe_seccomp();
	return failed;
}
