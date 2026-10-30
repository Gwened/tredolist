release:
	rm -f tredolist-firefox.zip
	zip tredolist-firefox.zip \
		manifest.json \
		service_worker.js \
		setup-css.js \
		config.html \
		config.js \
		icon48.png \
		icon128.png \
		LICENSE \
		css/layout.css \
		css/theme-.css \
		css/theme-bright.css \
		css/theme-pastel.css \
		css/theme-dark.css
