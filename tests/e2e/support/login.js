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

	// WordPress and reverse proxies can answer a successful login with 301 or
	// 302. The auth cookie, not a particular redirect status, proves the login.
	expect(
		[ 301, 302 ],
		'WordPress accepted the test login redirect'
	).toContain( response.status() );
	const cookies = await page.context().cookies();
	expect(
		cookies.some( ( cookie ) =>
			cookie.name.startsWith( 'wordpress_logged_in_' )
		),
		'WordPress issued an authenticated session cookie'
	).toBe( true );
}

module.exports = { login };
