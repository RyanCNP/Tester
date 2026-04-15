name: Release Main

on:
  push:
    branches:
      - 

jobs:
  pipeline:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '24.14.0'
          cache: 'npm'

      - name: Validar mensagem do commit
        run: |
          MSG="$(git log -1 --pretty=%s)"
          if [[ ! "$MSG" =~ ^(feat|feat!|chore|fix|refactor|docs)(\(.+\))?:|^Merge|^Revert ]]; then
            echo "❌ Mensagem de commit inválida!"
            exit 1
          fi

      - name: Instalar dependências
        run: npm ci

      - name: Instalar semver
        run: npm install -g semver

      - name: Criar tag inicial (se necessário)
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          if [ -z "$(git tag --list)" ]; then
            git config --global user.name 'github-actions'
            git config --global user.email 'github-actions@github.com'
            git tag -a v0.0.0 -m "Initial release"
            git remote set-url origin https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git
            git push origin v0.0.0
          fi

      - name: Calcular nova versão
        id: version
        shell: bash
        run: |
          git fetch --tags --force --prune
          LAST_TAG=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1 || echo "v0.0.0")
          CURRENT_VERSION="${LAST_TAG#v}"
          
          # Lógica simplificada de incremento semântico baseada em commits
          MAJOR=0; MINOR=0; PATCH=0
          COMMITS=$(git log ${LAST_TAG}..HEAD --pretty=format:'%s')
          
          while read -r COMMIT; do
            if [[ "$COMMIT" =~ ^feat! || "$COMMIT" == *"BREAKING CHANGE"* ]]; then MAJOR=1;
            elif [[ "$COMMIT" =~ ^feat ]]; then MINOR=1;
            elif [[ "$COMMIT" =~ ^fix ]]; then PATCH=1; fi
          done <<< "$COMMITS"

          if [[ $MAJOR -eq 1 ]]; then NEW_VERSION=$(semver -i major "$CURRENT_VERSION")
          elif [[ $MINOR -eq 1 ]]; then NEW_VERSION=$(semver -i minor "$CURRENT_VERSION")
          else NEW_VERSION=$(semver -i patch "$CURRENT_VERSION"); fi

          echo "new_version=$NEW_VERSION" >> $GITHUB_OUTPUT
          echo "should_deploy=$([[ $CURRENT_VERSION != $NEW_VERSION ]] && echo true || echo false)" >> $GITHUB_OUTPUT

      - name: Atualizar package.json e Tag
        if: steps.version.outputs.should_deploy == 'true'
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          NEW_VERSION: ${{ steps.version.outputs.new_version }}
        run: |
          npm version $NEW_VERSION --no-git-tag-version
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git remote set-url origin https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git
          git add package.json
          git commit -m "chore(release): v$NEW_VERSION [skip ci]"
          git tag "v$NEW_VERSION"
          git push origin main --tags

      - name: Criar Release GitHub
        if: steps.version.outputs.should_deploy == 'true'
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ steps.version.outputs.new_version }}
          name: "Release v${{ steps.version.outputs.new_version }}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  notify_failure:
    name: Notificar Falha
    needs: pipeline
    runs-on: ubuntu-latest
    if: failure()
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Renderizar Template HTML
        id: render_html
        env:
          REPO: ${{ github.repository }}
          BRANCH: ${{ github.ref_name }}
          WORKFLOW: ${{ github.workflow }}
          SHA: ${{ github.sha }}
          ACTOR: ${{ github.actor }}
          SERVER_URL: ${{ github.server_url }}
          RUN_ID: ${{ github.run_id }}
          REPO_NAME: ${{ github.event.repository.name }}
        run: |
          # Processa o arquivo no caminho mostrado na sua imagem
          envsubst < .github/templates/e-mail.actions.html > rendered_email.html
          echo "html_body<<EOF" >> $GITHUB_OUTPUT
          cat rendered_email.html >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Enviar E-mail
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: ${{ secrets.MAIL_HOST }}
          server_port: ${{ secrets.MAIL_PORT }}
          username: ${{ secrets.MAIL_USER }}
          password: ${{ secrets.MAIL_PASS }}
          subject: "🚨 ERRO EM PRODUÇÃO: ${{ github.repository }} [main]"
          to: "${{ secrets.TEAM_EMAILS }}"
          from: "CI/CD Production Monitor <no-reply@seu-novo-projeto.com>"
          html_body: ${{ steps.render_html.outputs.html_body }}