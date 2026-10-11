import * as v from "valibot";

export const subscribeSchema = v.object({
	email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email address"), v.maxLength(254)),
});
