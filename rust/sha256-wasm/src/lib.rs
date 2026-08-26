#![deny(unsafe_op_in_unsafe_fn)]

use sha2::{Digest, Sha256};
use std::{mem, ptr, slice};

const SHA256_DIGEST_BYTES: usize = 32;

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let capacity = size.max(1);
    let mut buffer = Vec::<u8>::with_capacity(capacity);
    let pointer = buffer.as_mut_ptr();
    mem::forget(buffer);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, size: usize) {
    if pointer.is_null() {
        return;
    }

    let capacity = size.max(1);
    // SAFETY: callers may pass only pointers returned by `alloc` with the same requested size.
    unsafe { drop(Vec::from_raw_parts(pointer, 0, capacity)) };
}

#[no_mangle]
pub extern "C" fn sha256_new() -> *mut Sha256 {
    Box::into_raw(Box::new(Sha256::new()))
}

#[no_mangle]
pub unsafe extern "C" fn sha256_update(
    handle: *mut Sha256,
    pointer: *const u8,
    length: usize,
) -> i32 {
    if handle.is_null() || (length > 0 && pointer.is_null()) {
        return 0;
    }

    let bytes = if length == 0 {
        &[]
    } else {
        // SAFETY: the JS wrapper writes exactly `length` bytes into an allocation from `alloc`.
        unsafe { slice::from_raw_parts(pointer, length) }
    };
    // SAFETY: `handle` comes from `sha256_new` and remains owned until finalize/free.
    unsafe { (*handle).update(bytes) };
    1
}

#[no_mangle]
pub unsafe extern "C" fn sha256_finalize(handle: *mut Sha256, output: *mut u8) -> i32 {
    if handle.is_null() || output.is_null() {
        return 0;
    }

    // SAFETY: `handle` comes from `sha256_new` and is consumed exactly once here.
    let hasher = unsafe { Box::from_raw(handle) };
    let digest = hasher.finalize();
    // SAFETY: `output` points to an allocation of at least SHA256_DIGEST_BYTES bytes.
    unsafe { ptr::copy_nonoverlapping(digest.as_ptr(), output, SHA256_DIGEST_BYTES) };
    1
}

#[no_mangle]
pub unsafe extern "C" fn sha256_free(handle: *mut Sha256) {
    if !handle.is_null() {
        // SAFETY: `handle` comes from `sha256_new` and has not been finalized or freed.
        unsafe { drop(Box::from_raw(handle)) };
    }
}
