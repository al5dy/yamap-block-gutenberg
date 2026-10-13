const { expect } = require( '@playwright/test' );

/**
 * Signs in by posting the login form through the page's request context.
 *
 * The session cookies land in the browser context without ever rendering the
 * WordPress dashboard, whose load time depends on unrelated plugins and made
 * UI-driven logins time out.
 *
 * @param {import('@playwright/test').Page} page     Page whose context signs in.
 * @param {string}                          username WordPress user name.
 * @param {string}                          password WordPress password.
 */
async function login( page, username, password ) {
	const response = await page.request.post( '/wp-login.php', {
		form: { log: username, pwd: password, 'wp-submit': 'Log In' },
		maxRedirects: 0,
	} );

	// WordPress redirects after a successful login and re-renders the form
	// with HTTP 200 when the credentials are rejected.
	expect( response.status(), 'WordPress accepted the test login' ).toBe(
		302
	);
}

module.exports = { login };
